# Doorbeller: DoorBird → Echo-Ansage

Ein Node.js-Gateway verbindet die DoorBird mit ausgewählten Echo-Geräten. Standardtext: **„Es hat an der Haustür geklingelt.“** Der optionale Cloudflare Tunnel macht den Klingelaufruf ohne Router-Portfreigabe erreichbar. Amazon-Passwörter werden weder konfiguriert noch gespeichert.

```text
DoorBird — HTTPS GET /ring?token=… — Cloudflare Tunnel — gateway:8080
                                                        ↓
                                               alexa-remote2 → Amazon → Echos
```

Die Implementierung ist mit simulierten Amazon-Antworten getestet. Echter Amazon-Login, MFA, DoorBird-WebHook, Echo-Ausgabe wurden noch nicht getestet. Der Linux/amd64-Container-Build wurde in GitHub Actions erfolgreich geprüft; ein ARM64-Build ist noch offen. Der Alexa-Client verwendet inoffizielle Amazon-Schnittstellen: Änderungen durch Amazon können eine erneute Anmeldung oder ein Dependency-Update erfordern. Ansagen benötigen Internet, Amazon und den laufenden Gateway. Der Mac muss eingeschaltet und wach bleiben; ein Tunnel umgeht keinen Ruhezustand.

## 1. Container-Runtime auf dem Mac

Installiere Docker Desktop für **Apple Silicon** über [Docker](https://docs.docker.com/desktop/setup/install/mac-install/) und starte es. Alternativ ist eine Docker-kompatible Runtime mit Compose möglich. Prüfe:

```sh
docker version
docker compose version
```

Auf dem späteren Linux/amd64-Homeserver verwende Docker Engine und das Compose-Plugin. Kein festes `platform` ist gesetzt; Node und cloudflared bieten ARM64 und AMD64. Native Node-Module sind nicht erforderlich.

## 2. Konfiguration und Secrets

Im Projektverzeichnis:

```sh
cp .env.example .env
mkdir -p secrets
chmod 700 secrets
# Mit lokalem Node.js >=22:
node scripts/token.js > secrets/ring_token
# Alternativ ohne lokales Node.js:
# docker run --rm node:24-bookworm-slim node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))' > secrets/ring_token
: > secrets/tunnel_token
chmod 644 secrets/ring_token secrets/tunnel_token
```

Trage in `.env` bei `ECHO_TARGETS` die exakten Echo-Namen aus der Alexa-App oder die Seriennummern ein, durch Kommas getrennt. Mehrdeutige Namen, unbekannte/offline Geräte und Geräte ohne Audio-Player werden abgewiesen. Seriennummern sind bei gleichen Namen vorzuziehen. Alle Ziele werden vor jeder Ansage geprüft, identische Seriennummern werden zusammengefasst.

Die Secret-Dateien sind für die unterschiedlichen Container-UIDs lesbar (Compose bindet sie ohne UID-Remapping ein); das übergeordnete Host-Verzeichnis `secrets` bleibt **0700** und schützt sie vor anderen Host-Benutzern. Session-Dateien und Session-Sicherungen bleiben **0600**.

Die Token-Dateien, `.env` und Sessions sind von Git und Docker-Build-Kontext ausgeschlossen. Keine echten Secrets in Issue, PR oder Chat schreiben. Für lokale Ausführung ohne Docker kann `RING_TOKEN` gesetzt werden; im Container wird die Secret-Datei verwendet.

## 3. Amazon-Erstlogin mit MFA

```sh
docker compose build gateway
docker compose stop gateway
docker compose --profile setup run --rm --service-ports login
```

Öffne auf **demselben Rechner** exakt **http://127.0.0.1:3456/** im Desktop-Browser. Führe den interaktiven Amazon.de-Login einschließlich MFA durch. Verwende den aktuellen OTP/Authenticator-Ablauf, falls SMS-/E-Mail-MFA nicht funktioniert. Passwort und MFA werden nur im Browser eingegeben. Die Anmeldung kann durch Amazon zusätzliche Bestätigungen verlangen.

Nach Erfolg erscheint „Session gespeichert.“ und der Login-Container beendet sich. Ein vollständiges Registration-Objekt mit Refresh-Token wird im benannten Volume gespeichert (Verzeichnis 0700, Datei 0600). Es ist so vertraulich wie ein Passwort. Die Oberfläche ist nur während dieses Befehls verfügbar, an 127.0.0.1 gebunden und beendet sich spätestens nach zehn Minuten. Das Gateway öffnet niemals einen Login-Proxy. Tunnel und Login sind getrennt; der Tunnel zeigt ausschließlich auf Port 8080 des Gateway.

## 4. Lokal starten und echte Ansage testen

```sh
docker compose -f compose.yaml -f compose.local.yaml up -d gateway
curl --fail http://127.0.0.1:8080/health/live
curl --fail http://127.0.0.1:8080/health/ready
# Token per Header, ohne ihn im URL-Aufruf zu verwenden:
curl --fail --config - <<EOF_CURL
url = "http://127.0.0.1:8080/ring"
request = "POST"
header = "Authorization: Bearer $(cat secrets/ring_token)"
EOF_CURL
```

Readiness muss HTTP 200 und `ready:true` liefern. `/ring` liefert **202**, sobald das Ereignis aufgenommen wurde; die tatsächliche Ansage erfolgt danach. Höre an jedem gewählten Echo nach. Ein erfolgreicher Amazon-Aufruf bestätigt keine hörbare Wiedergabe.

```sh
docker compose logs --tail 50 gateway
```

`announcement_result` nennt Gesamtzahl, erfolgreiche und fehlgeschlagene Aufrufe sowie Timeouts; keine Zielnamen, Sessions oder URL-Tokens. Ein Teilausfall wird als Fehler behandelt, bereits erfolgreiche Ziele werden nicht wiederholt.

## 5. Cloudflare Tunnel anbinden

Verwende eine bei Cloudflare eingerichtete eigene Domain und einen **remotely managed** Tunnel im Cloudflare-Dashboard. `doorbird.hiroshui.men` ist lediglich ein Vorschlag; wähle deinen tatsächlichen Hostnamen. Für dieses Projekt ist kein kostenpflichtiges Zusatzabo vorgesehen.

1. Tunnel erstellen oder bestehenden Tunnel wählen und dessen Connector-Token **lokal** in `secrets/tunnel_token` speichern, ohne Anführungszeichen. `chmod 644 secrets/tunnel_token`.
2. Eine öffentliche Hostname-Route einrichten: Service **HTTP**, Ziel **`gateway:8080`**. Extern ist der Zugriff HTTPS.
3. Keinen Cloudflare-Access-Browserlogin vor die DoorBird-Route schalten. Prüfe auch, dass Challenge-/Bot-Regeln den Geräteaufruf nicht blockieren.
4. Lokalen Testport entfernen und Produktionsdienste starten:

```sh
docker compose -f compose.yaml -f compose.local.yaml down
docker compose --profile tunnel up -d gateway cloudflared
```

`down` ohne `-v` erhält die Session. Im normalen Compose gibt es **keinen Host-Port** am Gateway. Am öffentlichen Hostnamen zunächst `/health/ready` und anschließend einen authentifizierten `/ring`-Aufruf testen. Die Health-Routen enthalten nur Status, keine Zugangsdaten.

Eigene Anwendungen protokollieren keinerlei Request-URLs. Cloudflare, Browser-Verlauf oder andere vorgeschaltete Systeme können URLs dennoch speichern: keine vollständigen Webhook-URLs teilen, keine Request-URL-Logs aktivieren und Token bei Offenlegung rotieren. Der Gateway-Pfad `/ring` ist öffentlich bekannt; das zufällige Token ist die Authentifizierung.

## 6. DoorBird verdrahten

Die DoorBird-LAN-API dokumentiert HTTP(S)-Favoriten mit URL einschließlich optionaler URL-Zugangsdaten, aber keine frei wählbaren Bearer-Header für ausgehende Benachrichtigungen. Deshalb verwendet die DoorBird den unterstützten URL-Weg:

```text
https://DEIN-HOSTNAME/ring?token=DEIN-ZUFÄLLIGES-RING-TOKEN
```

Den Inhalt von `secrets/ring_token` **nur lokal** in die URL einsetzen. In der DoorBird-App als Administrator den Bereich **HTTP-Aufrufe / HTTP Calls** öffnen, einen Eintrag „Echo Haustür“ mit dieser HTTPS-URL anlegen und speichern. Dann im Klingel-/Türklingel-Zeitplan dieses Ereignis dem HTTP-Aufruf zuordnen und alle Wochentage sowie alle Zeitfenster aktivieren. Der LAN-API-Wochentagsplan besteht aus 30-Minuten-Fenstern; in der App also den kompletten Wochenplan markieren. Bei mehreren Klingeltasten die gewünschte Taste wählen. Menübezeichnungen hängen vom Modell und App-Stand ab.

Erst den Testaufruf der App, dann die physische Klingeltaste prüfen. Ein HTTP-Favorit allein löst keine dauerhaften Klingelereignisse aus: der Zeitplan muss ebenfalls gespeichert sein. Für die LAN-API-Verwaltung benötigt der DoorBird-Benutzer „API operator“; Basic-/Digest-Auth an der LAN-API ist getrennt von der Webhook-Authentifizierung. Keine Router-Portfreigaben einrichten.

## Betrieb und Fehlerfälle

- **202:** aufgenommen. **200 mit `debounced:true`:** Wiederholung im Debounce-Fenster verworfen, kein neues Ereignis. **401:** Token fehlt/falsch. **429:** Queue einschließlich laufendem Ereignis voll. **503:** Alexa nicht bereit oder Shutdown. Fehlgeschlagene Aufnahme verändert das Debounce-Fenster nicht.
- Queue nur im RAM, maximal vier Ereignisse einschließlich laufender Ansage; fünf Sekunden Debounce; Ereignisse älter als 15 Sekunden werden verworfen. Neustarts verlieren ausstehende Ereignisse bewusst. Bei Ansagefehlern wird die übrige Queue geleert. Keine automatischen Wiederholungen von Ansagen.
- Requests an Amazon laufen maximal fünf Sekunden; der Transport wird bei Deadline aktiv geschlossen. Bereits an Amazon übermittelte Ansagen können trotzdem später abgespielt werden; sie lassen sich bei einem unklaren Timeout nicht zurückholen. Der Gateway sendet sie nicht erneut.
- `/health/live` prüft den Prozess, `/health/ready` zusätzlich Alexa/Auth/Ziele. Der Docker-Healthcheck verwendet Liveness. Readiness während Auth-Prüfung/Refresh ist 503. Jede Minute werden Auth und Geräteliste geprüft; vorübergehende Netzfehler können sich dadurch erholen.
- alexa-remote2 erneuert die Session täglich, vollständige aktualisierte Registration-Daten werden atomar gespeichert. Bei `login_required` Gateway stoppen und Schritt 3 wiederholen; bei `invalid_targets` Namen/Seriennummern korrigieren und Gateway neu starten. Bei `session_error` Volume/Rechte prüfen. Kein Passwort-Fallback, kein öffentlicher Proxy.
- `docker compose restart gateway` für kontrollierten Neustart. SIGTERM beendet die Annahme, verwirft Queue und stoppt Alexa-Timer. Compose startet abgestürzte Dienste erneut. Ein `unhealthy`-Status allein erzwingt keinen Neustart.
- Token rotieren: neues Secret erzeugen, `docker compose up -d --force-recreate gateway`, DoorBird-URL aktualisieren. Tunnel-Token über Cloudflare rotieren.
- Mac-Ruhezustand während des Betriebs verhindern; zum zeitweiligen Testen `caffeinate -i` in einem Terminal laufen lassen. WLAN/Internet müssen verfügbar bleiben.

## Migration auf den Homeserver

1. Gleiche Projektversion kopieren und gleiche `.env`/Secrets sicher übertragen; Dateirechte erhalten. Keine Secrets in Git.
2. Gateway auf dem Mac stoppen. Sicherung: `docker compose cp gateway:/data/session.json ./secrets/session-backup.json` und `chmod 600 secrets/session-backup.json`.
3. Auf dem Homeserver Images für dessen Architektur bauen: `docker compose build gateway`.
4. Session in das neue Volume übernehmen:

```sh
docker compose run --rm --no-deps \
  -v "$PWD/secrets/session-backup.json:/backup/session.json:ro" \
  gateway node --input-type=module -e \
  'import {readFileSync} from "node:fs"; import {saveSession} from "./src/session.js"; saveSession("/data/session.json", JSON.parse(readFileSync("/backup/session.json", "utf8")));'
docker compose --profile tunnel up -d gateway cloudflared
```

5. Readiness und echten Klingeltest prüfen; wenn Amazon die neue Umgebung nicht akzeptiert, lokal neu anmelden (auf entferntem Server per SSH-Portweiterleitung `ssh -L 3456:127.0.0.1:3456 SERVER`). Den Mac-Connector abgeschaltet lassen. Die öffentliche Tunnel-Route und DoorBird-URL bleiben bei gleichem Tunnel unverändert.

## Entwicklung und Prüfung

```sh
npm ci
npm test
node node_modules/alexa-cookie2/test/run-tests.js
```

Node >=22; getestet mit Node 26.7.0. Alexa-Version und transitive Dependencies sind im Lockfile fixiert. `npm ci` installiert einen engen, versiongeprüften Transport-Patch; Docker führt ihn ausdrücklich nach Installation ohne Dependency-Scripts aus. Details, Quellen und verbleibende Dependency-Lücke: [Architektur](docs/architecture.md). Test-/Build-Status: [Prüfbericht](docs/verification.md).

## macOS-Autostart mit Podman

Nach erfolgreicher Einrichtung von Gateway und Tunnel einmal im Projektverzeichnis ausführen:

```sh
npm run mac:install
```

Installiert einen Benutzer-LaunchAgent `de.hiroshui.doorbeller` und startet ihn sofort. Bei jeder macOS-Anmeldung startet er bei Bedarf die vorhandene Podman-Machine und hält Gateway sowie Tunnel mit der aktuellen `.env` am Laufen. Alle 60 Sekunden wird der Compose-Zustand erneut hergestellt; fehlende/gestoppte Container werden gestartet. `caffeinate -i -s` verhindert den automatischen Ruhezustand, während der Bildschirm ausgehen darf. Ein geschlossener Deckel kann trotzdem Ruhezustand erzwingen. Vor einer Benutzeranmeldung läuft dieser Benutzer-Autostart nicht. Projektverzeichnis und Secret-Dateien müssen am selben Ort bleiben; nach Verschieben `npm run mac:install` erneut ausführen.

Status und Logs:

```sh
launchctl print "gui/$(id -u)/de.hiroshui.doorbeller"
podman compose ps
podman compose logs --tail 50 gateway cloudflared
```

Supervisor-Logs: `~/Library/Logs/doorbeller/`. Zum bewussten Stoppen zuerst den Autostart abschalten, sonst startet er die Container erneut:

```sh
launchctl bootout "gui/$(id -u)/de.hiroshui.doorbeller"
podman compose --profile tunnel stop gateway cloudflared
```

Dauerhaft entfernen: anschließend `~/Library/LaunchAgents/de.hiroshui.doorbeller.plist` löschen. Andere Projekte und Podman-Machines werden nicht gestoppt.
