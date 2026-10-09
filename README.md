# Laufbursche INMOTION Tool (inmotion-unlock)

A static web page that talks to INMOTION e-scooters and self-balancing wheels over Web Bluetooth. Today it is a diagnostic and capture tool: it auto-detects the BLE transport (Nordic UART or FFE0), enumerates the GATT services your device exposes and logs every incoming notification as hex. There is deliberately no speed-cap Set button yet - the byte frame it would need is not proven from a capture for INMOTION. One single capture collected with this page unlocks the Set button for all 20 supported models. Nothing to install: no app store, no signing, no developer account. It runs in **Bluefy** on iOS and in **Chrome** on Android or desktop.

> **This is a feasibility study.** It exists to show what the Bluetooth protocol of these scooters makes accessible, not to be a finished product. The protocol was recovered as symbol names from the official INMOTION Android app (`com.inmotion.android.app` 8.1.34). The exact byte layout stays gated until one Bluetooth HCI capture or notification capture proves it. Error-free operation is not promised and there is no warranty of any kind. Whatever you do with it, you do at your own risk.

**Open the web app: [inmotion-unlock.pages.dev](https://inmotion-unlock.pages.dev/)**

Or run it yourself, no build step, no dependencies: clone the repo and serve the folder over a local HTTP server. Opening `index.html` directly as a `file://` URL will not work, the page fetches its own documents and browsers block that over `file://`.

```
git clone https://github.com/Laufbursche42/inmotion-unlock.git
cd inmotion-unlock
python -m http.server 8000
```

Any static server works. With Node installed, this does the same job:

```
npx serve .
```

Then open the printed address in a browser that supports Web Bluetooth.

**Guide: [Deutsch](GUIDE.de.md) | [English](GUIDE.en.md)** covers every step from first connect to sending in a capture file.

## Supported models

20 models were uniquely identified in the INMOTION app, all sharing one BLE transport and one command family (`lorin`):

- Scooters: A1, C1, L8, LE1, LR1, RS Pro, RS Velo, S1
- EUCs: E10, E20, E25, P6, V6, V11, V12, V13, V14, V18, X1

What works today for every one of them: auto-detect, connect, GATT enumeration, notification capture. What is pending for all of them: the Set button for the speed limit, which arrives after one user capture of the official app changing a value.

## What it does today

- **Auto-detect the transport.** INMOTION exposes either Nordic UART (`6E400001-...`) or the FFE0 family (`0000FFE0-...`). The page tries both after connecting and binds the matching write/notify characteristics.
- **Enumerate GATT.** After connecting a table lists every service and characteristic the device actually exposes, so you can see for yourself which transport is live and which characteristics are writable or notifying.
- **Live state.** A small set of tiles (transport name, ATT MTU where available, counters of received and sent packets) and the full GATT table.
- **Capture pane.** Start/stop capture of every incoming notification, with time + characteristic UUID + hex, and save/copy/clear the result. One capture of the official app changing the speed limit is what the project needs to decode the frame layout.
- **Expert raw-write.** Type bytes, pick a characteristic, confirm, write. No framing, no checksum - the bytes go out exactly as typed. Only use this if you know what you are sending.
- **Anonymized protocol log.** The log at the bottom shows every byte in and out, with the device name and long hex IDs anonymized by default so a log is safe to share.

## What it does NOT do (yet)

- **Set the speed limit.** The byte frame is not proven from a capture, and we do not ship a Set button that would be a guess. One user capture unlocks it for every supported model.
- **Lock/unlock, mode, lights.** Same reason - these are Dart symbols (`genLockMsg`, `genSetDriveModeMsg`, ...) with known names but unknown byte layouts. Captures unlock them.
- **Firmware flashing.** There is no OTA bridge for the vehicle controller here. The Jieli OTA service `0000AE00-...` is a companion-chip channel and is listed only in the GATT table; it is not used by this tool.

## No special pairing

INMOTION allows an optional 4- to 6-digit BLE PIN. Most vehicles do not have one set. If yours does, enter it in the PIN field at the top; if not, leave the field empty. The connection itself is a standard Web Bluetooth GATT connect with no out-of-band pairing.

## Browser support

- **iOS:** the **Bluefy** browser. Safari and every other iOS browser run on the Safari engine, which has no Web Bluetooth at all.
- **Android or desktop:** **Chrome** or another Chromium browser. Web Bluetooth is built in.

## Project structure

```
index.html                - the single page: cards, GATT table, capture pane, expert raw-write
app.js                    - all logic: transports, GATT walk, capture, expert write, UI
i18n.js                   - the German and English string table
styles.css                - theme and layout (shared canon with the sibling unlock pages)
GUIDE.de.md, GUIDE.en.md  - the step-by-step guide
scripts/                  - check-i18n.js and security-scan.py (run in CI and the git hooks)
.github/workflows/        - CI (JS lint plus security scan) and CodeQL
.githooks/                - pre-commit and pre-push checks
```

## Development

No build step and no dependencies. Edit the files and reload the page. Serve locally, Web Bluetooth needs `https` or `localhost`:

```
python -m http.server 8000
```

Run the same checks as the CI and the hooks:

```
node scripts/check-i18n.js
python scripts/security-scan.py
```

Enable the git hooks with `git config core.hooksPath .githooks`. New user-facing strings go into both languages in `i18n.js`; `check-i18n.js` fails on a missing or unused key.

## How to help us finish the Set button

If you have an INMOTION scooter or EUC:

1. Open this page in Chrome/Edge (Android/desktop) or Bluefy (iOS).
2. Connect to your scooter.
3. Hit **Start capture** on the BLE capture card.
4. On a second device (or after disconnecting here), open the official INMOTION app and change the speed limit.
5. Hit **Stop capture** and **Save capture (.log)**.
6. Send the file by DM on the eScooter forum (user Laufbursche) or via [Report an issue](https://github.com/Laufbursche42/Laufbursche42/issues).

One good capture is enough.

## Legal

Raising the maximum speed lifts the factory limit. The operating permit (Betriebserlaubnis, ABE) is then void and riding the scooter in public traffic is no longer allowed. Use it on your own vehicle only. Everything you do with this page is at your own risk.

## License

PolyForm Noncommercial 1.0.0 with two additional terms, in full in [LICENSE.md](LICENSE.md).

## Privacy

Nothing leaves your device but the page load itself. The details are in [PRIVACY.md](PRIVACY.md).

## Trademarks

An independent project, not affiliated with INMOTION. "INMOTION" and the model names are trademarks of their respective owners and are used here only to say which scooters this page works with. See [TRADEMARKS.md](TRADEMARKS.md).
