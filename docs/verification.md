# Prüfbericht

Stand: 08.10.2026.

- `npm ci` und `npm test`: 16 Tests, alle bestanden. Authfehler/GET/POST, gültige Aufnahme vor Amazon-Abschluss, Debounce, volle Queue, Liveness/Readiness bei Alexa-Ausfall, Ablauf alter Ereignisse, Queue-Verwerfen bei Fehler, vollständige Zielvalidierung, Teilausfall, Timeout/verspäteter Callback, sichere Session-Rechte, Config-Validierung sowie tatsächlicher Upstream-Speak mit JSON-HTTP-503 und aktiver Transport-Deadline.
- `node node_modules/alexa-cookie2/test/run-tests.js`: 12 Upstream-Testdateien bestanden (inklusive Registration und Login-Proxy).
- `npm audit`: fünf High-Einträge aus der beschriebenen transitiven braces-Lücke verbleiben; Cookie-Lücke behoben. Kein `audit fix --force`/Alexa-Downgrade.
- Echter lokaler Gateway-Prozess: Start, HTTP-Liveness 200, Readiness 503 ohne Login und SIGTERM mit Exit 0 geprüft.
- Docker/Compose-Build und Laufzeitprüfung: offen, Docker ist auf dem Arbeitsrechner nicht installiert. Alle Compose-Profile und der lokale Override mit Docker Compose 5.6.0 `config --quiet` validiert; dies ersetzt keinen Docker-Build.
- Amazon/MFA, Session-Refresh gegen Amazon, echte Echo-Ausgabe, Cloudflare-Connector, DoorBird-App-Menüs/WebHook: offen, keine Geräte-/Account-Zugangsdaten verwendet.

Nächste Handgriffe: Docker-Runtime starten; Echo-Namen oder Seriennummern konfigurieren; Ring-Token lokal erzeugen; interaktiven Amazon-Login ausführen; Readiness und Ansage testen; Tunnel/Hostname konfigurieren; DoorBird-HTTP-Favorit mit vollständigem Wochenzeitplan verbinden. Siehe README.
