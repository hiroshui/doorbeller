# Titel
DoorBird-Klingeln über ein Node.js-Gateway auf ausgewählten Echos ansagen

# Beschreibung
Implementiert einen einzelnen Node.js-Gateway mit alexa-remote2 für authentifizierte DoorBird-GET-/POST-Aufrufe und deutsche Echo-Ansagen. Ereignisse werden asynchron mit Debounce, begrenzter Queue und Ablaufzeit verarbeitet; Teilfehler und Timeouts lösen keine erneuten Ansagen aus. Lokaler interaktiver Amazon-Login mit MFA, restriktiv persistierte Refresh-Daten, getrennte Health-Routen und optionaler Cloudflare Tunnel sind enthalten.

Docker/Compose für ARM64 und AMD64, Secret-Dateien, lokale Testport-Overrides sowie deutsche Einrichtungs-, Betriebs- und Migrationsanleitung sind enthalten. Die Alexa-Dependency ist fixiert; ein enger versionsgeprüfter Transport-Patch verhindert blinde Wiederholungen und schließt Requests bei Deadline.

Validierung: 19 eigene Tests und 12 Upstream-Testdateien bestanden. Alle Compose-Profile und der lokale Override mit Docker Compose 5.6.0 `config --quiet` validiert. Linux/amd64-Docker-Build und Container-Smoke-Test ohne Zugangsdaten in GitHub Actions erfolgreich. ARM64-Build und echte Amazon-/DoorBird-/Echo-/Tunnel-Tests sind offen. npm audit meldet fünf High-Einträge aus einer derzeit ungefixten transitiven braces-Lücke im Login-Proxy; Cookie-Lücke per kompatiblem Override behoben. Details im Architektur- und Prüfbericht.

Nicht automatisch mergen. Vor Betrieb Erstlogin, Readiness, echte Ansage und DoorBird-Zeitplan gemäß README prüfen.


Ergänzt einen installierbaren macOS-LaunchAgent für Podman/Gateway/Tunnel und lokale macOS-Benachrichtigungen bei angenommenen Klingelereignissen. Der lokale Empfänger verfolgt ausschließlich aktuelle Container-Ereignisse, ohne öffentliche Zusatzroute oder Token-Kopie, und verbindet sich nach Neustarts erneut. Autostart und nativer Notification-Aufruf auf dem Mac geprüft; Banner-Sichtbarkeit bleibt von den Mitteilungs-/Fokus-Einstellungen abhängig. Podman/ARM64-Build und echter Echo-Test inzwischen ebenfalls erfolgreich.
