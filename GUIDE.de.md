# Anleitung: Laufbursche INMOTION unlock

> **Machbarkeitsstudie.** Dieses Werkzeug zeigt, was das Bluetooth-Protokoll von INMOTION-Scootern und -Einrädern (EUCs) heute zugänglich macht. Es ist kein fertiges Produkt. Ein fehlerfreier Betrieb wird nicht zugesichert und es gibt keine Gewähr. Was immer du damit tust, tust du auf eigenes Risiko und nur am eigenen Fahrzeug.

> **Scope dieser Seite:** Diese Seite ist heute ein Diagnose- und Mitschnitt-Werkzeug. Sie kann sich mit deinem INMOTION verbinden, zeigt alle angebotenen GATT-Dienste und schneidet jede eingehende Benachrichtigung als Hex mit. Einen Setzen-Knopf für das Geschwindigkeits-Limit gibt es BEWUSST noch nicht - der dafür nötige Byte-Rahmen ist für INMOTION noch nicht aus einem Mitschnitt belegt. Mit einem einzigen Mitschnitt aus der Original-App ist das freischaltbar; genau diesen Mitschnitt sammelt diese Seite ein.

> **Wichtig für Fehler-Reports:** Schalte unten auf der Seite den **Diagnose-Log** ein, *bevor* du dich mit dem Scooter verbindest. Nur dann wird der komplette Verbindungsaufbau mitgeschnitten - und genau diese Zeilen brauchen wir in einem [Ticket](https://github.com/Laufbursche42/Laufbursche42/issues), um ein Problem nachzuvollziehen.

## 1. Was du brauchst

**Einen Browser mit Web-Bluetooth-Unterstützung.**

- **iOS:** den Browser **Bluefy** (kostenlos im App Store). Safari und jeder andere iOS-Browser laufen auf der Safari-Engine, die kein Web Bluetooth hat.
- **Android oder Desktop:** **Chrome** oder ein anderer Chromium-Browser. Web Bluetooth ist eingebaut.

**Einen INMOTION-Scooter oder EUC.** Die Seite kennt die 20 Modelle, die in der INMOTION-App eindeutig identifiziert sind: Scooter A1, C1, L8, LE1, LR1, RS Pro, RS Velo, S1 sowie EUCs E10, E20, E25, P6, V6, V11, V12, V13, V14, V18, X1. Alle teilen sich den gleichen BLE-Transport.

---

## 2. Verbinden

1. Öffne die Seite in Bluefy oder Chrome.
2. Schalte den Scooter ein. Halte ihn ein paar Meter neben das Telefon.
3. Hast du in der INMOTION-App eine 4- bis 6-stellige PIN gesetzt? Dann trag sie oben ein. Standard ist keine PIN - Feld leer lassen.
4. Tippe auf **Verbinden** und wähle deinen Scooter im Browser-Dialog.
5. Beobachte den Status oben rechts: `verbinde`, dann `verbunden`, und darunter den erkannten Transport (Nordic UART oder FFE0).

**Android: Standort muss an sein.** Unter Android sucht Chrome nur nach Bluetooth, wenn der Standortdienst (GPS) an ist und Chrome die Berechtigung Standort oder Geräte in der Nähe hat. Sonst bleibt die Geräteliste leer, obwohl der Scooter direkt daneben steht. Schließe außerdem zuerst die Original-INMOTION-App vollständig (wegwischen), sonst hält sie die Verbindung und der Scooter meldet sich nicht mehr für den Browser.

Die Seite zeigt nach dem Verbinden eine Tabelle aller GATT-Dienste und -Merkmale, die dein Gerät anbietet. Das ist dieselbe Information, die auch die Original-App zum Verbindungsaufbau nutzt - nur für dich sichtbar.

---

## 3. Mitschnitt für die Geschwindigkeits-Entsperrung

Das ist der Kern dieser Seite.

1. Verbinde dich mit dieser Seite mit dem Scooter.
2. Tippe auf **Mitschnitt starten** in der Karte **BLE-Mitschnitt**.
3. Nimm ein zweites Gerät (zweites Handy oder Tablet) und öffne dort die Original-INMOTION-App. Verbinde dich mit dem gleichen Scooter.
4. Ändere in der Original-App die Geschwindigkeits-Begrenzung oder einen anderen Wert deiner Wahl. Oder: trenne hier, setze den Wert in der Original-App, verbinde dich hier wieder und wiederhole den Mitschnitt.
5. Tippe auf **Mitschnitt stoppen** und auf **Mitschnitt speichern (.log)**.
6. Schicke die `.log`-Datei per DM im eScooter-Forum (User Laufbursche) oder über [Fehler melden](https://github.com/Laufbursche42/Laufbursche42/issues).

Mit genau einem solchen Mitschnitt lässt sich der Byte-Rahmen für INMOTION entschlüsseln. Danach bekommt diese Seite einen Setzen-Knopf, der für ALLE 20 Modelle funktioniert.

**Was ist im Mitschnitt drin?** Nur die rohen Hex-Bytes, die der Scooter zurücksendet, und die UUIDs der Merkmale, auf denen sie ankommen. Keine Kontodaten, keine Passwörter, kein Standort. Der Schalter **Öffentliches Log** anonymisiert zusätzlich den Gerätenamen und lange Hex-IDs.

---

## 4. GATT-Dienste lesen (für Interessierte)

Nach dem Verbinden erscheint die Tabelle **GATT-Dienste und Merkmale**. Jede Zeile ist ein Merkmal, das dein Scooter anbietet.

- **Nordic UART (6E400001-...)**: der klassische Nordic-UART-Transport, Write auf `6E400002`, Notify auf `6E400003`. Das ist der primäre Transport für die aktuelle INMOTION-App.
- **FFE0-Familie (0xFFE0 / 0xFFE4 / 0xFFE5 / 0xFFE9)**: ein zweiter Transport, den manche INMOTION-Modelle anbieten. Die Seite erkennt beide automatisch.
- **Jieli OTA (0xAE00 / 0xAE01 / 0xAE02)**: der Firmware-Update-Kanal für einen Begleitchip - NICHT der Fahrzeug-Kanal. Diese Seite berührt diesen Kanal nicht.

---

## 5. Experten-Modus (rohe Bytes schreiben)

Nur für Entwickler. Die Karte **Experten-Modus** erlaubt dir, exakt die Bytes, die du einträgst, an ein von dir gewähltes Merkmal zu schreiben. Die Seite baut keinen Rahmen für dich, keine Prüfsumme - genau so, wie du sie einträgst, gehen sie raus.

Vor jedem Senden erscheint eine Bestätigung mit dem Ziel-Merkmal und den Bytes. Falsche Bytes können den Scooter in einen unerwarteten Zustand bringen.

---

## 6. Sauber testen und melden

Teste nur am eigenen Gerät auf privatem Gelände. Das Protokoll-Log unten ist ein vollständiger Mitschnitt jedes gesendeten und empfangenen Bytes. Melde Probleme oder Erfolge als [GitHub-Issue](https://github.com/Laufbursche42/inmotion-unlock/issues) mit dem kopierten Protokoll, damit klar ist, was gesendet und empfangen wurde.

---

## 7. Grenzen, die man kennen sollte

- Der Byte-Rahmen (Opcode, Länge, Prüfsumme) der INMOTION-Pakete ist auf dieser Seite noch nicht belegt. Ein Setzen-Knopf wäre deshalb geraten; die Seite hat bewusst keinen.
- Die INMOTION-App ist eine Flutter-Anwendung mit einem Dart-AOT-Kern. Statisch war der Rahmen mit den aktuellen Werkzeugen noch nicht komplett entpackbar; ein Mitschnitt der Original-App liefert ihn direkt.
- Es gibt hier kein Firmware-Flashen.
- INMOTION kennt eine optionale 4- bis 6-stellige BLE-PIN. Sie ist in der Regel nicht gesetzt. Wenn deine App eine PIN gesetzt hat, trag sie oben ein - sonst Feld leer lassen.

---

## 8. Rechtliches

Das Anheben der Höchstgeschwindigkeit hebt die Werksdrossel auf. Die ABE erlischt damit und der Betrieb auf öffentlichen Wegen ist dann nicht mehr erlaubt. Nutze es nur am eigenen Fahrzeug und auf eigenes Risiko.

## Mithelfen

Hast du einen INMOTION und willst, dass die Geschwindigkeits-Entsperrung schnell kommt? Verbinde dich mit dieser Seite, starte den Mitschnitt, änder in der Original-App einen Wert und schick den Mitschnitt. Mit einer einzigen Datei kommt der Setzen-Knopf für alle 20 Modelle. Kontakt per DM im eScooter-Forum (Laufbursche) oder über [GitHub](https://github.com/Laufbursche42/Laufbursche42/issues).
