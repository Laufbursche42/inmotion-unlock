'use strict';
// Laufbursche INMOTION Tool - a Web Bluetooth client for INMOTION scooters/EUCs.
// This build is a diagnostic + live-telemetry-capture tool. The exact byte layout of INMOTION
// frames is not yet proven from a capture, so the page intentionally does NOT ship a canned
// speed-set opcode. Instead it exposes:
//   - auto-detected transport (Nordic UART or FFE0 family),
//   - a GATT service / characteristic enumeration table,
//   - a notification capture pane (start/stop/save) that a user with an INMOTION can run while
//     changing the speed limit in the official app on a second device, so one capture can
//     decode the frame layout for every model in the lorin command family,
//   - an expert raw-write pane (user types bytes, picks a characteristic, confirms, writes).
const BUILD = 'imu-v1';

// =====================================================================================
// INMOTION BLE transports (ground truth, from the Dart AOT constant pool of
// com.inmotion.android.app 8.1.34 - full 128-bit UUIDs are present as literals).
// =====================================================================================
const TRANSPORTS = [
  { id:1, name:'Nordic UART', service:'6e400001-b5a3-f393-e0a9-e50e24dcca9e', write:'6e400002-b5a3-f393-e0a9-e50e24dcca9e', notify:'6e400003-b5a3-f393-e0a9-e50e24dcca9e' },
  { id:2, name:'FFE0 (ffe9 write / ffe4 notify)', service:'0000ffe0-0000-1000-8000-00805f9b34fb', write:'0000ffe9-0000-1000-8000-00805f9b34fb', notify:'0000ffe4-0000-1000-8000-00805f9b34fb' },
  { id:3, name:'FFE0 (ffe5 write / ffe4 notify)', service:'0000ffe0-0000-1000-8000-00805f9b34fb', write:'0000ffe5-0000-1000-8000-00805f9b34fb', notify:'0000ffe4-0000-1000-8000-00805f9b34fb' },
];
// Jieli OTA (ae00/ae01/ae02) is the companion-chip firmware bridge, not the vehicle control
// channel - we expose it in the GATT enumeration but never use it as the vehicle transport.
const JIELI_OTA_SERVICE = '0000ae00-0000-1000-8000-00805f9b34fb';
const ALL_SERVICES = [...new Set([...TRANSPORTS.map(t=>t.service), JIELI_OTA_SERVICE])];

// Advertised-name prefixes INMOTION uses across its scooter and EUC families.
const SCAN_PREFIXES = ['INMOTION','Inmotion','V11','V12','V13','V14','V18','P6','V6','E10','E20','E25','X1','A1','C1','L8','LE1','LR1','S1','RS'];

// --------------------------- model roster ---------------------------
// 20 models uniquely identified in the INMOTION app (per-model Dart file paths observed in
// the Dart AOT string dump). All share the same BLE transport and the same lorin command
// family. Status is "capture-pending" until one HCI/notify capture decodes the frame layout.
const MODELS = [
  { name:'A1',      type:'scooter' },
  { name:'C1',      type:'scooter' },
  { name:'L8',      type:'scooter' },
  { name:'LE1',     type:'scooter' },
  { name:'LR1',     type:'scooter' },
  { name:'RS Pro',  type:'scooter' },
  { name:'RS Velo', type:'scooter' },
  { name:'S1',      type:'scooter' },
  { name:'E10',     type:'euc' },
  { name:'E20',     type:'euc' },
  { name:'E25',     type:'euc' },
  { name:'P6',      type:'euc' },
  { name:'V6',      type:'euc' },
  { name:'V11',     type:'euc' },
  { name:'V12',     type:'euc' },
  { name:'V13',     type:'euc' },
  { name:'V14',     type:'euc' },
  { name:'V18',     type:'euc' },
  { name:'X1',      type:'euc' }
];

// --------------------------- helpers ---------------------------
const $ = (id) => document.getElementById(id);
const LS = { THEME: 'imu_theme', LANG: 'imu_lang', PUBLOG: 'imu_publog', PIN: 'imu_pin' };
function hex(bytes){ return bytes.map(b=>b.toString(16).padStart(2,'0').toUpperCase()).join(' '); }
function parseHex(s){ return (s.match(/[0-9a-fA-F]{2}/g) || []).map(h=>parseInt(h,16)); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function shortUuid(u){
  const m = /^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/i.exec(String(u || ''));
  return m ? ('0x' + m[1].toUpperCase()) : String(u);
}

// =====================================================================================
// i18n
// =====================================================================================
let lang = 'de';
function table() { return (window.I18N && window.I18N[lang]) || {}; }
function t(key) { const v = table()[key]; return (typeof v === 'string') ? v : ''; }
function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-t]').forEach(n => {
    const v = t(n.getAttribute('data-t'));
    if (/[<&]/.test(v)) n.innerHTML = v; else n.textContent = v;   // scan-ok: our own translation table
  });
  { const el = $('link-guide'); if (el) el.href = docFile('GUIDE'); }
  { const el = $('link-readme'); if (el) el.href = docFile('README'); }
  { const el = $('link-license'); if (el) el.href = docFile('LICENSE'); }
  { const el = $('link-privacy'); if (el) el.href = docFile('PRIVACY'); }
  { const el = $('link-trademarks'); if (el) el.href = docFile('TRADEMARKS'); }
  { const el = $('langs'); if (el) el.setAttribute('aria-label', t('langGroup')); }
  { const el = $('build-ver'); if (el) el.textContent = t('buildLabel') + ' ' + BUILD; }
  { const el = $('enc-state'); if (el) el.textContent = t('encNone'); }
  document.querySelectorAll('#langs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  renderModels();
  renderCaptureState();
  { const el = $('status'); setStatus(el ? el.dataset.state : 'disconnected'); }
  { const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    const el = $('btn-theme'); if (el) { el.setAttribute('aria-label', t(dark ? 'themeToLight' : 'themeToDark')); el.title = el.getAttribute('aria-label'); } }
}
function initLangSwitch() {
  let saved = null; try { saved = localStorage.getItem(LS.LANG); } catch (e) {}
  if (saved === 'de' || saved === 'en') lang = saved;
  document.querySelectorAll('#langs button').forEach(b => b.addEventListener('click', () => {
    lang = b.dataset.lang; try { localStorage.setItem(LS.LANG, lang); } catch (e) {} applyLang();
  }));
}

// =====================================================================================
// theme
// =====================================================================================
function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const b = $('btn-theme');
  if (b) { b.textContent = dark ? '☀' : '☾'; b.setAttribute('aria-label', t(dark ? 'themeToLight' : 'themeToDark')); b.title = b.getAttribute('aria-label'); }
  try { localStorage.setItem(LS.THEME, dark ? 'dark' : 'light'); } catch (e) {}
}
function initTheme() {
  let saved = null; try { saved = localStorage.getItem(LS.THEME); } catch (e) {}
  applyTheme(saved !== 'light');
  const b = $('btn-theme');
  if (b) b.addEventListener('click', () => applyTheme(document.documentElement.getAttribute('data-theme') === 'light'));
}

// =====================================================================================
// log (anonymized on the way out; the buffer keeps raw text with \x01..\x01 sensitive spans)
// =====================================================================================
let logBuffer = [];
let publicLog = true;
let diag = false;
function redact(text) {
  let s = String(text);
  if (device && device.id) s = s.split(device.id).join('[redacted-id]');
  s = s.replace(/\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g, '[redacted-mac]');
  s = s.replace(/\b(secret|token|key|aes|pwd|password|pin|mac|serial|vin|uid|imei)\b(\s*[:=]\s*)("?)([^\s",]+)\3/gi,
    (m, k, sep) => k + sep + '[redacted]');
  s = s.replace(/\b[0-9A-Fa-f]{16,}\b/g, '[redacted-hex]');
  return s;
}
function anonymize(s) {
  if (!publicLog) return String(s).replace(/\x01/g, '');
  return redact(String(s).replace(/\x01[^\x01]*\x01/g, 'XX').replace(/\x01/g, ''));
}
function logLine(cls, text) {
  const safe = '[' + new Date().toTimeString().slice(0, 8) + '] ' + text;
  logBuffer.push({ raw: safe, cls: cls });
  const el = $('log'); if (!el) return;
  const span = document.createElement('span');
  if (cls) span.className = cls; span.textContent = anonymize(safe) + '\n';
  el.appendChild(span); el.scrollTop = el.scrollHeight;
}
function renderLog() {
  const el = $('log'); if (!el) return;
  el.textContent = '';
  for (const e of logBuffer) { const span = document.createElement('span'); if (e.cls) span.className = e.cls; span.textContent = anonymize(e.raw) + '\n'; el.appendChild(span); }
  el.scrollTop = el.scrollHeight;
}
function logText() { return logBuffer.map(e => anonymize(e.raw)).join('\n'); }
function saveTextFile(text, name) {
  try {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (e) { return false; }
}
const logTx = (b, charUuid) => logLine('log-tx', '>>> ' + (charUuid ? shortUuid(charUuid) + ' ' : '') + hex(b));
const logRx = (b, charUuid) => logLine('log-rx', '<<< ' + (charUuid ? shortUuid(charUuid) + ' ' : '') + hex(b));
const logSys = (text) => logLine('', '--- ' + text);
const logErr = (text) => logLine('log-err', '!!! ' + text);
const logDiag = (text) => { if (diag) logLine('', '... ' + text); };
function logDiagnosticHeader() {
  logLine('', '=== inmotion-unlock diagnostic ===');
  logLine('', 'build: ' + BUILD);
  logLine('', 'time: ' + new Date().toISOString());
  logLine('', 'userAgent: ' + (navigator.userAgent || '?'));
  logLine('', 'webBluetooth: ' + (navigator.bluetooth ? 'yes' : 'no'));
  logLine('', 'scope: diagnostic + capture (no speed-set opcode shipped)');
  logLine('', '==================================');
}

// =====================================================================================
// BLE state
// =====================================================================================
let device=null, server=null, writeChar=null, notifyChar=null, transport=null;
let gattServices=[], gattWritable=[], connected=false;
let rxCount=0, txCount=0;

function getPin(){
  const el = $('pin-in'); if (!el) return '';
  return String(el.value || '').replace(/\D/g,'').slice(0,6);
}

function updateCounters(){
  const r=$('t-rx'); if(r) r.textContent=String(rxCount);
  const tx=$('t-tx'); if(tx) tx.textContent=String(txCount);
}

async function connect(){
  if(connected){ await disconnect(); return; }
  if(!navigator.bluetooth){ logErr('Web Bluetooth not available (needs Chrome, Edge or Bluefy)'); return; }
  try{
    setStatus('connecting');
    const showAll = $('showall') && $('showall').checked;
    const req = showAll
      ? { acceptAllDevices: true, optionalServices: ALL_SERVICES }
      : { filters: SCAN_PREFIXES.map(p => ({ namePrefix: p })), optionalServices: ALL_SERVICES };
    device = await navigator.bluetooth.requestDevice(req);
    device.addEventListener('gattserverdisconnected', onDisc);
    logSys('device: \x01' + (device.name || '(no name)') + '\x01');
    setStatus('linking');
    server = await device.gatt.connect();

    // Walk every advertised service - a bond-free enumeration of what the device actually exposes.
    gattServices = []; gattWritable = []; transport = null; writeChar = null; notifyChar = null;
    try {
      const services = await server.getPrimaryServices();
      for (const svc of services){
        const chars = await svc.getCharacteristics().catch(()=>[]);
        const entry = { service: svc.uuid, chars: [] };
        for (const c of chars){
          const props = [];
          if (c.properties.read) props.push('read');
          if (c.properties.write) props.push('write');
          if (c.properties.writeWithoutResponse) props.push('writeNoResp');
          if (c.properties.notify) props.push('notify');
          if (c.properties.indicate) props.push('indicate');
          entry.chars.push({ uuid: c.uuid, props: props, obj: c });
          if (c.properties.write || c.properties.writeWithoutResponse){
            gattWritable.push({ service: svc.uuid, uuid: c.uuid, obj: c });
          }
        }
        gattServices.push(entry);
      }
    } catch (e) {
      logErr('GATT enumeration failed: ' + (e && e.message ? e.message : e));
    }

    // Pick a transport by first matching the known (service, write, notify) triples; walk is union.
    for (const tr of TRANSPORTS){
      const svc = gattServices.find(s => s.service.toLowerCase() === tr.service.toLowerCase());
      if (!svc) continue;
      const w = svc.chars.find(c => c.uuid.toLowerCase() === tr.write.toLowerCase() && (c.obj.properties.write || c.obj.properties.writeWithoutResponse));
      const n = svc.chars.find(c => c.uuid.toLowerCase() === tr.notify.toLowerCase() && (c.obj.properties.notify || c.obj.properties.indicate));
      if (w && n){ transport = tr; writeChar = w.obj; notifyChar = n.obj; break; }
    }
    if (!transport){
      logErr('no known INMOTION transport (NUS or FFE0) matched among this device\'s services');
      renderGatt(); renderWriteTargets();
      setStatus('no-service');
      // Keep the connection open for the user to still inspect services + run the expert raw-write.
      connected = true;
      revealInteractive(true);
      setControlsEnabled(true);
      return;
    }
    await notifyChar.startNotifications();
    notifyChar.addEventListener('characteristicvaluechanged', onNotify);
    connected = true;
    rxCount = 0; txCount = 0; updateCounters();
    setStatus('connected');
    revealInteractive(true);
    setControlsEnabled(true);

    const transEl = $('t-transport'); if (transEl) transEl.textContent = transport.name;
    const mtuEl = $('t-mtu'); if (mtuEl) mtuEl.textContent = '-';   // Web Bluetooth has no MTU API
    const devinfo = $('devinfo');
    if (devinfo) devinfo.textContent = t('devPrefix') + ' ' + ((publicLog && device.name) ? 'XX' : (device.name || '')) + '  -  transport ' + transport.id + ' (' + transport.name + ')';
    renderGatt();
    renderWriteTargets();
    logSys('connected, transport ' + transport.id + ' (' + transport.name + ')');
  }catch(e){ logErr('connect aborted: ' + (e && e.message ? e.message : e)); setStatus('disconnected'); }
}
async function disconnect(){ try{ if(device && device.gatt.connected) device.gatt.disconnect(); }catch(e){} onDisc(); }
function onDisc(){
  connected=false; writeChar=null; notifyChar=null; transport=null;
  gattServices=[]; gattWritable=[];
  if (capture.running) stopCapture();
  setStatus('disconnected'); setControlsEnabled(false); revealInteractive(false);
  const el = $('devinfo'); if (el) el.textContent = '';
  const transEl = $('t-transport'); if (transEl) transEl.textContent = '-';
  const mtuEl = $('t-mtu'); if (mtuEl) mtuEl.textContent = '-';
  rxCount = 0; txCount = 0; updateCounters();
  renderGatt(); renderWriteTargets();
  logSys('disconnected');
}

function revealInteractive(on){
  ['live-card','capture-card','raw-card'].forEach(id => { const el = $(id); if (el) el.hidden = !on; });
}
const CONTROL_IDS = ['btn-raw','btn-capture-start','btn-capture-stop'];
function setControlsEnabled(on){
  const btnRaw = $('btn-raw'); if (btnRaw) btnRaw.disabled = !on || gattWritable.length === 0;
  const btnStart = $('btn-capture-start'); if (btnStart) btnStart.disabled = !on || capture.running;
  const btnStop = $('btn-capture-stop'); if (btnStop) btnStop.disabled = !capture.running;
}

function statusLabel(s){
  const map = { disconnected:'stDisconnected', connecting:'stConnecting', linking:'stLinking',
    connected:'stConnected', 'no-service':'stNoService', 'no-char':'stNoChar' };
  return t(map[s] || 'stDisconnected') || s;
}
function setStatus(s){
  const el = $('status'); if (el) { el.dataset.state = s; el.textContent = statusLabel(s); }
  const cb = $('btn-conn');
  if (cb) { const on = (s === 'connecting' || s === 'linking' || s === 'connected' || s === 'no-service'); cb.textContent = on ? t('btnDisconnect') : t('btnConnect'); }
}

// =====================================================================================
// GATT table + write-target picker
// =====================================================================================
function renderGatt(){
  const tbody = $('gatt-body'); if (!tbody) return;
  tbody.textContent = '';
  for (const svc of gattServices){
    for (const c of svc.chars){
      const tr = document.createElement('tr');
      const td1 = document.createElement('td'); td1.textContent = shortUuid(svc.service);
      const td2 = document.createElement('td'); td2.textContent = shortUuid(c.uuid);
      const td3 = document.createElement('td'); td3.textContent = c.props.join(', ');
      tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
      tbody.appendChild(tr);
    }
  }
}
function renderWriteTargets(){
  const sel = $('raw-target'); if (!sel) return;
  sel.textContent = '';
  for (const w of gattWritable){
    const o = document.createElement('option');
    o.value = w.service + '|' + w.uuid;
    o.textContent = shortUuid(w.service) + ' / ' + shortUuid(w.uuid);
    sel.appendChild(o);
  }
}

// =====================================================================================
// notifications: for a diagnostic page we just log every incoming notify as hex (per-char),
// bump the rx counter and, if a capture is running, append it to the capture buffer.
// No telemetry decoding until a user capture proves the byte layout.
// =====================================================================================
function onNotify(ev){
  const v = new Uint8Array(ev.target.value.buffer);
  const b = Array.from(v);
  const uuid = ev.target.uuid || (notifyChar && notifyChar.uuid) || '?';
  rxCount++; updateCounters();
  logRx(b, uuid);
  if (capture.running) captureAppend('<<<', uuid, b);
}

// =====================================================================================
// capture pane
// =====================================================================================
const capture = { running: false, lines: [], started: null };
function captureHeader(){
  return [
    '# inmotion-unlock capture, build ' + BUILD,
    '# started: ' + (capture.started ? capture.started.toISOString() : '?'),
    '# transport: ' + (transport ? (transport.name + ' (' + transport.id + ')') : '?'),
    '# device: ' + ((publicLog && device && device.name) ? 'XX' : (device && device.name || '')),
    '# format: HH:MM:SS DIR char-uuid HEX',
    ''
  ].join('\n');
}
function captureAppend(dir, uuid, bytes){
  const line = new Date().toTimeString().slice(0,8) + ' ' + dir + ' ' + shortUuid(uuid) + ' ' + hex(bytes);
  capture.lines.push(line);
  const el = $('capture-log');
  if (el){ el.textContent += line + '\n'; el.scrollTop = el.scrollHeight; }
}
function renderCaptureState(){
  const s = $('capture-state'); if (!s) return;
  s.textContent = capture.running ? t('captureStateRunning')
    : (capture.lines.length ? t('captureStateStopped') : t('captureStateIdle'));
  const copy = $('btn-capture-copy'); if (copy) copy.disabled = !capture.lines.length;
  const clear = $('btn-capture-clear'); if (clear) clear.disabled = !capture.lines.length;
  const save = $('btn-capture-save'); if (save) save.disabled = !capture.lines.length;
  const start = $('btn-capture-start'); if (start) start.disabled = !connected || capture.running;
  const stop = $('btn-capture-stop'); if (stop) stop.disabled = !capture.running;
}
function startCapture(){
  if (!connected){ logErr('capture: not connected'); return; }
  capture.running = true; capture.started = new Date();
  if (!capture.lines.length){
    const el = $('capture-log'); if (el) el.textContent = captureHeader();
  }
  logSys('capture: started');
  renderCaptureState();
}
function stopCapture(){
  if (!capture.running) return;
  capture.running = false;
  logSys('capture: stopped (' + capture.lines.length + ' notifications)');
  renderCaptureState();
}
function clearCapture(){
  capture.lines = []; const el = $('capture-log'); if (el) el.textContent = '';
  renderCaptureState();
}
function copyCapture(){
  const text = captureHeader() + capture.lines.join('\n') + '\n';
  navigator.clipboard.writeText(text).then(() => logSys('capture copied')).catch(() => {});
}
function saveCapture(){
  const text = captureHeader() + capture.lines.join('\n') + '\n';
  const name = 'laufbursche42-inmotion-capture-' + new Date().toISOString().replace(/[:.]/g,'-') + '.log';
  if (saveTextFile(text, name)) logSys('capture saved: ' + name);
  else logErr('capture save failed');
}

// =====================================================================================
// expert raw-write (confirmation dialog, user-chosen target)
// =====================================================================================
function pickWriteTarget(){
  const sel = $('raw-target'); if (!sel || !sel.value) return null;
  const [svcU, charU] = sel.value.split('|');
  const w = gattWritable.find(x => x.service === svcU && x.uuid === charU);
  return w || null;
}
function openConfirm(bodyText, onOk){
  const dlg = $('confirm'); if (!dlg) { if (confirm(bodyText)) onOk(); return; }
  const body = $('confirm-body'); if (body) body.textContent = bodyText;
  const ok = $('confirm-ok'), no = $('confirm-no'), x = $('confirm-x');
  function cleanup(){
    if (ok) ok.onclick = null;
    if (no) no.onclick = null;
    if (x) x.onclick = null;
  }
  if (ok) ok.onclick = () => { cleanup(); try { dlg.close(); } catch (e) {} onOk(); };
  if (no) no.onclick = () => { cleanup(); try { dlg.close(); } catch (e) {} };
  if (x)  x.onclick  = () => { cleanup(); try { dlg.close(); } catch (e) {} };
  if (dlg.showModal) { try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); } }
  else dlg.setAttribute('open', '');
}
async function sendRaw(){
  const w = pickWriteTarget();
  if (!w){ logErr('no write target picked'); return; }
  const bytes = parseHex($('raw-hex').value);
  if (!bytes.length){ logErr('raw-write: empty input'); return; }
  const buf = Uint8Array.from(bytes);
  openConfirm('Raw-write to ' + shortUuid(w.service) + ' / ' + shortUuid(w.uuid) + ':\n' + hex(bytes), async () => {
    try {
      if (w.obj.writeValueWithoutResponse) await w.obj.writeValueWithoutResponse(buf);
      else await w.obj.writeValue(buf);
      txCount++; updateCounters();
      logTx(bytes, w.uuid);
      if (capture.running) captureAppend('>>>', w.uuid, bytes);
    } catch (e) {
      logErr('raw-write failed: ' + (e && e.message ? e.message : e));
    }
  });
}

// =====================================================================================
// models table
// =====================================================================================
function renderModels(){
  const tbody = $('models-body'); if (!tbody) return;
  tbody.textContent = '';
  for (const m of MODELS){
    const tr = document.createElement('tr');
    const c1 = document.createElement('td'); c1.textContent = m.name;
    const c2 = document.createElement('td'); c2.textContent = t(m.type === 'euc' ? 'typeEuc' : 'typeScooter');
    const c3 = document.createElement('td'); c3.textContent = t('valYes');
    const c4 = document.createElement('td'); c4.textContent = t('valMaybe');
    tr.appendChild(c1); tr.appendChild(c2); tr.appendChild(c3); tr.appendChild(c4);
    tbody.appendChild(tr);
  }
}

// =====================================================================================
// control wiring
// =====================================================================================
function wire(){
  $('btn-conn').addEventListener('click', connect);
  $('btn-raw').addEventListener('click', sendRaw);

  $('btn-capture-start').addEventListener('click', startCapture);
  $('btn-capture-stop').addEventListener('click', stopCapture);
  $('btn-capture-copy').addEventListener('click', copyCapture);
  $('btn-capture-clear').addEventListener('click', clearCapture);
  $('btn-capture-save').addEventListener('click', saveCapture);

  // PIN persistence (local only). Field is optional per INMOTION's optional-PIN scheme.
  { const pin = $('pin-in'); if (pin) {
      try { const saved = localStorage.getItem(LS.PIN); if (saved) pin.value = saved; } catch (e) {}
      pin.addEventListener('change', () => { try { localStorage.setItem(LS.PIN, pin.value.replace(/\D/g,'').slice(0,6)); } catch (e) {} });
  }}

  $('btn-copy-log').addEventListener('click', () => navigator.clipboard.writeText(logText()).then(() => logSys('log copied')).catch(() => {}));
  $('btn-clear-log').addEventListener('click', () => { logBuffer = []; const el = $('log'); if (el) el.textContent = ''; logDiagnosticHeader(); });
  $('btn-save-log').addEventListener('click', () => {
    const name = 'laufbursche42-inmotion-log.txt';
    if (saveTextFile(logText(), name)) logSys('log saved: ' + name);
    else logErr('log save failed');
  });
  { const pl = $('public-log'); if (pl) { pl.checked = publicLog; pl.addEventListener('change', () => { publicLog = pl.checked; try { localStorage.setItem(LS.PUBLOG, publicLog ? '1' : '0'); } catch (e) {} logSys('public-log: ' + (pl.checked ? 'on (anonymizing device name/id)' : 'off')); renderLog(); }); } }
  { const dg = $('diag-log'); if (dg) dg.addEventListener('change', () => { diag = dg.checked; logSys('diag-log: ' + (dg.checked ? 'on' : 'off')); }); }
  { const sa = $('showall'); if (sa) sa.addEventListener('change', () => { logSys('show-all-frames: ' + (sa.checked ? 'on' : 'off')); renderLog(); }); }

  document.querySelectorAll('.help-btn').forEach(btn => btn.addEventListener('click', () => openHelp(btn.getAttribute('data-help'))));
  ['help-x', 'help-close'].forEach(id => { const b = $(id); if (b) b.addEventListener('click', closeHelp); });
  { const b = $('link-disclaimer'); if (b) b.addEventListener('click', e => { e.preventDefault(); openDocFile(docFile('DISCLAIMER'), 'footDisclaimer'); }); }
}

// =====================================================================================
// document viewer (markdown of our own docs) + help
// =====================================================================================
const DOC_TITLES = {
  'GUIDE.de.md': 'footGuide', 'GUIDE.en.md': 'footGuide',
  'PRIVACY.de.md': 'footPrivacy', 'PRIVACY.md': 'footPrivacy',
  'LICENSE.de.md': 'footLicense', 'LICENSE.md': 'footLicense',
  'TRADEMARKS.de.md': 'footTrademarks', 'TRADEMARKS.md': 'footTrademarks',
  'DISCLAIMER.de.md': 'footDisclaimer', 'DISCLAIMER.md': 'footDisclaimer',
  'README.md': 'footReadme'
};
const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const slug = s => s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/ /g, '-');
function mdToHtml(src) {
  const inline = s => escHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, text, href) => {
      if (DOC_TITLES[href]) return '<a href="' + href + '" data-docfile="' + href + '">' + text + '</a>';
      return '<a href="' + href + '" target="_blank" rel="noopener">' + text + '</a>';
    });
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = []; let para = [], inFence = false, listKind = null;
  const flushPara = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
  const closeList = () => { if (listKind) { out.push('</' + listKind + '>'); listKind = null; } };
  const cells = l => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], body = l.trim();
    if (inFence) { if (body.startsWith('```')) { out.push('</code></pre>'); inFence = false; } else out.push(escHtml(l)); continue; }
    if (body.startsWith('```')) { flushPara(); closeList(); out.push('<pre><code>'); inFence = true; continue; }
    if (body === '') { flushPara(); closeList(); continue; }
    if (/^(-{3,})\s*$/.test(body)) { flushPara(); closeList(); out.push('<hr>'); continue; }
    { const bq = body.match(/^>\s?(.*)$/); if (bq) { flushPara(); closeList(); out.push('<blockquote>' + inline(bq[1]) + '</blockquote>'); continue; } }
    if (body.startsWith('|') && /^\|[\s:|-]+\|?\s*$/.test((lines[i + 1] || '').trim())) {
      flushPara(); closeList();
      out.push('<div class="doc-table"><table><thead><tr>' + cells(body).map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>');
      i++;
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) out.push('<tr>' + cells(lines[++i].trim()).map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>');
      out.push('</tbody></table></div>'); continue;
    }
    let m;
    if ((m = body.match(/^(#{1,4})\s+(.*)$/))) { flushPara(); closeList(); const n = m[1].length; out.push('<h' + n + ' id="' + slug(m[2]) + '">' + inline(m[2]) + '</h' + n + '>'); continue; }
    if ((m = body.match(/^[-*]\s+(.*)$/))) { flushPara(); if (listKind !== 'ul') { closeList(); out.push('<ul>'); listKind = 'ul'; } out.push('<li>' + inline(m[1]) + '</li>'); continue; }
    if ((m = body.match(/^\d+\.\s+(.*)$/))) { flushPara(); if (listKind !== 'ol') { closeList(); out.push('<ol>'); listKind = 'ol'; } out.push('<li>' + inline(m[1]) + '</li>'); continue; }
    closeList(); para.push(body);
  }
  if (inFence) out.push('</code></pre>');
  flushPara(); closeList();
  return out.join('\n').replace(/<pre><code>\n/g, '<pre><code>');
}
const docCache = {};
const docFile = name => { if (name === 'GUIDE') return 'GUIDE.' + lang + '.md'; if (name === 'README') return 'README.md'; return lang === 'de' ? name + '.de.md' : name + '.md'; };
function openDocFile(file, titleKey) {
  const dlg = $('doc'), body = $('doc-body'); if (!dlg || !body) return;
  const mark = (lang === 'de' && !file.includes('.de.') && file !== 'README.md') ? ' ' + t('docEnglish') : '';
  $('doc-title').textContent = (t(titleKey || DOC_TITLES[file] || '') || file) + mark;
  if (typeof dlg.showModal === 'function') dlg.showModal();
  const showDoc = html => { body.innerHTML = html; const h1 = body.querySelector('h1'); if (h1) { $('doc-title').textContent = h1.textContent.trim() + mark; h1.remove(); } body.scrollTop = 0; }; // scan-ok: markdown of our own documents, escaped by mdToHtml first
  if (docCache[file]) { showDoc(docCache[file]); return; }
  body.innerHTML = '<p>' + escHtml(t('docLoading')) + '</p>'; // scan-ok: escaped
  fetch(file + '?v=' + BUILD).then(r => { if (!r.ok) throw new Error(r.status + ' ' + r.statusText); return r.text(); })
    .then(txt => { docCache[file] = mdToHtml(txt); showDoc(docCache[file]); })
    .catch(e => { body.innerHTML = '<p>' + escHtml(t('docFail')) + '</p><pre class="log-err">' + escHtml(file + ': ' + (e && e.message ? e.message : e)) + '</pre>'; }); // scan-ok: escaped
}
function wireDocViewer() {
  document.addEventListener('click', e => {
    if (!e.target.closest) return;
    const disc = e.target.closest('[data-open-disclaimer]'); if (disc) { e.preventDefault(); openDocFile(docFile('DISCLAIMER'), 'footDisclaimer'); return; }
    const a = e.target.closest('[data-doc], [data-docfile]'); if (!a) return;
    e.preventDefault();
    const file = a.getAttribute('data-docfile');
    if (file) openDocFile(file, a.getAttribute('data-t') || '');
    else openDocFile(docFile(a.getAttribute('data-doc')), a.getAttribute('data-t') || '');
  });
  ['doc-x', 'doc-close'].forEach(id => { const b = $(id); if (b) b.addEventListener('click', () => { const d = $('doc'); if (d) d.close(); }); });
}
const HELP = {
  live: ['liveTitle', 'helpLive'],
  capture: ['captureTitle', 'helpCapture'],
  pending: ['pendingTitle', 'helpPending'],
  expert: ['expertTitle', 'helpExpert'],
  publiclog: ['publicLogLabel', 'helpPublicLog'],
  diaglog: ['diagLogLabel', 'helpDiagLog']
};
function openHelp(key) {
  const m = HELP[key]; if (!m) return; const dlg = $('help'); if (!dlg) return;
  $('help-title').textContent = t(m[0]);
  const bo = $('help-body'); if (bo) { const v = t(m[1]); if (/[<&]/.test(v)) bo.innerHTML = v; else bo.textContent = v; } // scan-ok: our own translation table
  if (dlg.showModal) { try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); } } else dlg.setAttribute('open', '');
}
function closeHelp() { const dlg = $('help'); if (dlg && dlg.close) dlg.close(); }

// =====================================================================================
// init
// =====================================================================================
window.addEventListener('DOMContentLoaded', () => {
  initLangSwitch();
  initTheme();
  wireDocViewer();
  wire();
  try { const p = localStorage.getItem(LS.PUBLOG); if (p === '0') publicLog = false; } catch (e) {}
  { const pl = $('public-log'); if (pl) pl.checked = publicLog; }
  renderModels();
  renderCaptureState();
  applyLang();
  setStatus('disconnected');
  { const el = $('platform-note'); if (el) el.hidden = !!navigator.bluetooth; }
  logDiagnosticHeader();
});
