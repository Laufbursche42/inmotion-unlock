# Guide: Laufbursche INMOTION unlock

> **Feasibility study.** This tool shows what the Bluetooth protocol of INMOTION scooters and self-balancing wheels (EUCs) makes accessible today. It is not a finished product. Error-free operation is not promised and there is no warranty. Whatever you do with it, you do at your own risk and on your own vehicle only.

> **Scope of this page:** this page is a diagnostic and capture tool today. It connects to your INMOTION, lists every GATT service it exposes and logs every incoming notification as hex. There is DELIBERATELY no Set button for the speed limit yet - the byte frame needed for it has not been proven from a capture for INMOTION. One single capture from the official app unlocks it; collecting that capture is exactly what this page is for.

> **Important for error reports:** switch on the **Diagnostic log** at the bottom of the page *before* you connect to the scooter. Only then is the full connection handshake captured - and those are exactly the lines we need in a [ticket](https://github.com/Laufbursche42/Laufbursche42/issues) to reproduce a problem.

## 1. What you need

**A browser that supports Web Bluetooth.**

- **iOS:** the **Bluefy** browser (free on the App Store). Safari and every other iOS browser run on the Safari engine, which has no Web Bluetooth at all.
- **Android or desktop:** **Chrome** or another Chromium browser. Web Bluetooth is built in.

**An INMOTION scooter or EUC.** The page knows the 20 models that are uniquely identified in the INMOTION app: scooters A1, C1, L8, LE1, LR1, RS Pro, RS Velo, S1 and EUCs E10, E20, E25, P6, V6, V11, V12, V13, V14, V18, X1. All share the same BLE transport.

---

## 2. Connect

1. Open the page in Bluefy or Chrome.
2. Turn the scooter on. Keep it a few meters next to the phone.
3. Did you set a 4- to 6-digit PIN in the INMOTION app? If so, enter it at the top. Default is no PIN - leave the field empty.
4. Tap **Connect** and choose your scooter in the browser chooser.
5. Watch the status top right: `connecting`, then `connected`, and below it the detected transport (Nordic UART or FFE0).

**Android: Location must be on.** On Android, Chrome only scans for Bluetooth when Location services (GPS) are on and Chrome has the Location or Nearby-devices permission. Otherwise the device list stays empty even though the scooter is right there. Also close the official INMOTION app fully first (swipe it away), otherwise it holds the connection and the scooter no longer advertises for the browser to see.

After connecting the page shows a table of every GATT service and characteristic your device exposes. That is the same information the official app uses to connect - just visible to you.

---

## 3. Capture for the speed-cap unlock

This is the point of the page.

1. Connect this page to the scooter.
2. Tap **Start capture** in the **BLE capture** card.
3. Pick up a second device (second phone or tablet) and open the official INMOTION app there. Connect to the same scooter.
4. In the official app, change the speed limit (or any other value you prefer). Or: disconnect here, set the value in the official app, reconnect here and restart the capture.
5. Tap **Stop capture** and then **Save capture (.log)**.
6. Send the `.log` file by DM on the eScooter forum (user Laufbursche) or via [Report an issue](https://github.com/Laufbursche42/Laufbursche42/issues).

Exactly one such capture is enough to decode the INMOTION byte frame. After that this page gets a Set button that works for ALL 20 models.

**What is in the capture?** Only the raw hex bytes the scooter sends and the UUIDs of the characteristics they arrive on. No account data, no passwords, no location. The **Public log** toggle additionally anonymizes the device name and long hex IDs.

---

## 4. Reading GATT services (for the curious)

After connecting the **GATT services and characteristics** table appears. Each row is one characteristic your scooter exposes.

- **Nordic UART (6E400001-...)**: the classic Nordic UART transport, write on `6E400002`, notify on `6E400003`. This is the primary transport for the current INMOTION app.
- **FFE0 family (0xFFE0 / 0xFFE4 / 0xFFE5 / 0xFFE9)**: a second transport that some INMOTION models expose. The page auto-detects both.
- **Jieli OTA (0xAE00 / 0xAE01 / 0xAE02)**: the firmware-update channel for a companion chip - NOT the vehicle channel. This page does not touch that channel.

---

## 5. Expert mode (raw byte write)

For developers only. The **Expert mode** card lets you write exactly the bytes you type to a characteristic you pick. The page builds no frame and no checksum - the bytes go out as you typed them.

Every send is gated by a confirmation dialog that shows the target characteristic and the bytes. Wrong bytes can leave the scooter in an unexpected state.

---

## 6. Clean testing and reporting

Test only on your own device on private ground. The protocol log at the bottom is a full record of every byte sent and received. Report problems or successes as a [GitHub issue](https://github.com/Laufbursche42/inmotion-unlock/issues) with the copied log, so it is clear what was sent and received.

---

## 7. Limits worth knowing

- The byte frame (opcode, length, checksum) of INMOTION packets is not yet proven on this page. A Set button would therefore be a guess; the page intentionally has none.
- The INMOTION app is a Flutter build with a Dart AOT core. Static analysis with the current tooling could not fully unpack the frame; a capture of the official app gives it directly.
- There is no firmware flashing here.
- INMOTION has an optional 4- to 6-digit BLE PIN. It is usually not set. If your app has set a PIN, enter it at the top - otherwise leave the field empty.

---

## 8. Legal

Raising the maximum speed lifts the factory limit. The operating permit (Betriebserlaubnis, ABE) is then void and riding the scooter in public traffic is no longer allowed. Use it on your own vehicle only. Everything you do with this page is at your own risk.

## Help us

Do you have an INMOTION and want the speed-cap unlock to come soon? Connect this page, start the capture, change a value in the official app and send the capture. One file unlocks the Set button for all 20 models. Contact by DM on the eScooter forum (Laufbursche) or via [GitHub](https://github.com/Laufbursche42/Laufbursche42/issues).
