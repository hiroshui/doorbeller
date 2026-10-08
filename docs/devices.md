# Weitere Handys und PCs einrichten

Der Gateway veröffentlicht bei jeder angenommenen Klingel genau eine Meldung im privaten ntfy-Kanal **haustuer**. Echo-Ansage und lokale Mac-Mitteilung laufen parallel. ntfy kann auch bei Alexa-Ausfall auslösen; mindestens einer der entfernten Ausgabewege muss bereit sein. `ECHO_TARGETS=all` wählt nur online gemeldete einzelne Echos, keine Gruppen/Tablets. Ausgabefehler werden unabhängig gemeldet und nicht blind wiederholt.

## Einmalige Einrichtung auf dem Server

```sh
npm run ntfy:setup
npm run ntfy:device -- add handy-maxi
npm run ntfy:device -- add pc-maxi
```

Standardserver: **https://notify.hiroshui.men**. Für einen anderen Hostnamen beim ersten Setup `NTFY_PUBLIC_URL=https://notify.example.com npm run ntfy:setup` verwenden. Mit `NTFY_CONTACT_EMAIL=deine-adresse@example.com` lässt sich beim ersten Setup der technische VAPID-Kontakt setzen; der Default `webpush@hiroshui.men` ist ein Kontakt-Platzhalter, an den keine Benachrichtigungen verschickt werden. Später den entsprechenden Wert in `secrets/ntfy/server.yml` anpassen und ntfy neu starten.

Die Skripte erkennen Podman; für Docker `CONTAINER_RUNTIME=docker` voranstellen. Sie erzeugen zufällige Zugangsdaten und native bcrypt-Hashes, Web-Push-Schlüssel und einen ausschließlich zum Senden berechtigten Gateway-Token. Sie starten ntfy mit dem eigenen Dockerfile als UID 1000, ohne Host-Port und mit schreibgeschütztem Root-Dateisystem. Daten liegen im privaten persistenten Volume. Das Setup ist wiederholbar und erhält Schlüssel und vorhandene Zugänge. Das Server-Config ist JSON in einer YAML-Datei (gültiges YAML), damit keine zusätzliche YAML-Abhängigkeit nötig ist.

In `.env` aktivieren:

```dotenv
NTFY_URL=http://ntfy:8080
NTFY_TOPIC=haustuer
NTFY_MESSAGE=Es hat an der Haustür geklingelt.
```

Anschließend:

```sh
podman compose build gateway
podman compose --profile notifications --profile tunnel up -d --force-recreate gateway cloudflared ntfy
npm run mac:install
```

Das Benutzer-Autostartscript erkennt die ntfy-Konfiguration und startet ntfy künftig mit. Ohne ntfy-Konfiguration startet es weiterhin nur Gateway und Tunnel. Zum interaktiven Amazon-Neulogin zuerst den LaunchAgent gemäß README abschalten, damit er den Gateway während des Logins nicht erneut startet. Gateway und Login teilen die Session und sollen nicht gleichzeitig laufen.

Im **bestehenden DoorBird-Tunnel** unter veröffentlichte Hostname-/Application-Routen eine zweite Route erstellen: **notify.hiroshui.men → HTTP → ntfy:8080**. Den bisherigen **doorbird.hiroshui.men → gateway:8080**-Eintrag erhalten. Kein weiterer Connector und kein neues Tunnel-Token nötig; kein Access-Browserlogin vor die ntfy-App setzen. Stattdessen authentifiziert ntfy selbst die Geräte.

## Handy: fertige ntfy-App

1. Die kostenlose **ntfy-App** für Android oder iOS installieren: [offizielle Downloads](https://docs.ntfy.sh/subscribe/phone/).
2. Die lokale Datei `secrets/ntfy/handy-maxi.json` öffnen. Darin stehen Server, Kanal, Benutzername und Passwort. Zugangsdaten nur auf das betreffende Gerät übertragen; nicht in Git/Chat/Cloudflare-URLs einfügen.
3. In den App-Einstellungen unter Benutzer/Users einen Zugang für **https://notify.hiroshui.men** mit Benutzername und Passwort hinzufügen. Bei neuen Abonnements den eigenen Server auswählen, nicht den Standardserver ntfy.sh.
4. Kanal **haustuer** abonnieren und Mitteilungen erlauben.
5. In App-/System-Mitteilungseinstellungen einen Ton wählen und die Klingel testen. Die Meldung hat Priorität 4. Lautlos, Fokus, Energiesparmodus und Betriebssystemregeln können den Ton oder die Zustellung beeinflussen; ein Ton wird nicht erzwungen.

Die selbst gehostete iOS-App nutzt den konfigurierten ntfy.sh-Relay für schnelle Push-Benachrichtigungen. Der Relay erhält eine Abfragekennung statt des Meldungstexts; die App holt die Nachricht authentifiziert von deinem Server. Internet, Apple/Google/Browser-Push-Dienste und die jeweiligen App-Einstellungen bleiben erforderlich. [iOS-Relay](https://docs.ntfy.sh/config/#ios-instant-notifications)

## PC: Web-App / installierbare Browser-App

1. **https://notify.hiroshui.men** im Browser öffnen.
2. Mit den Daten aus `secrets/ntfy/pc-maxi.json` anmelden und **haustuer** abonnieren.
3. Desktop-Mitteilungen und Hintergrund-/Web-Push in der Web-App aktivieren; dem Browser die Mitteilungsberechtigung geben. Wenn angeboten, als App/PWA installieren.
4. Einen Test auslösen. Der Benachrichtigungston hängt von Browser und Betriebssystem ab. Beliebige lokale MP3-Dateien lassen sich darüber nicht garantiert abspielen; dafür wäre ein zusätzlicher lokaler Audio-Empfänger erforderlich.

Web-Push-Schlüssel und Abonnement-Datenbank sind persistent; Schlüssel nicht ohne Anlass neu erzeugen, sonst müssen Browser neu abonniert werden. Ein geschlossener Browser beziehungsweise deaktivierte Hintergrundausführung kann je nach Plattform die Zustellung verhindern. [Web-App](https://docs.ntfy.sh/subscribe/web/)

## Weiteres Gerät oder Zugang widerrufen

Jedes zusätzliche Gerät bekommt einen eigenen Benutzer, damit es einzeln gesperrt werden kann:

```sh
npm run ntfy:device -- add iphone-partner
# Dann secrets/ntfy/iphone-partner.json auf diesem Gerät verwenden.
npm run ntfy:device -- remove iphone-partner
```

Die Befehle aktualisieren ausschließlich die lokale ntfy-Konfiguration und starten ntfy neu; Echo/Gateway werden nicht absichtlich gestoppt. Der kurze ntfy-Neustart trennt abonnierte Streams, Apps verbinden sich anschließend neu. Entfernte Benutzer werden bei diesem Neustart aus der Auth-Datenbank entfernt. Der Gerätezugang darf ausschließlich **haustuer lesen**; Schreiben, andere Kanäle und anonymer Zugriff sind gesperrt. Der Gateway darf ausschließlich **haustuer schreiben**. Niemand braucht einen Administrator-Account. Keine Passwörter oder API-Tokens als URL-Parameter benutzen.

Die Zugangsdaten liegen als 0600-Dateien in einem 0700-Verzeichnis und gehören nicht ins Projektarchiv. Die eingebundenen Server-/Publisher-Dateien sind für die Container-UID lesbar, während das private Host-Verzeichnis sie vor anderen Host-Benutzern schützt. Datenbank-Dateien werden mit umask 077 erzeugt. ntfy protokolliert nur Fehler; keine Debug-/Trace-Logs aktivieren.

## Verhalten bei Ausfällen und Umzug

Gateway-Queue und ntfy-Publisher haben Deadlines und keine Wiederholung von unklaren Sendevorgängen. Alte Gateway-Ereignisse werden verworfen. ntfy hält Meldungen nominell eine Minute vor, damit iOS sie abrufen kann; das ist kein dauerhaftes Klingelarchiv. Push-Anbieter oder offline gewesene Apps können dennoch verzögert zustellen. Eine garantierte Echtzeit-/Exactly-once-Zustellung oder eine garantierte Übersteuerung von Lautlos gibt es nicht.

Zur Migration zusätzlich zu Alexa-Session und Ring-/Tunnel-Secrets das private Verzeichnis `secrets/ntfy`, `secrets/ntfy_publish_token` und das Volume `ntfy-data` sicher übertragen. Das Volume enthält Auth, kurze Meldungscaches und Browser-Abonnements; es ist vertraulich. Den alten Server vor dem Umzug stoppen, Original-VAPID-Schlüssel erhalten und danach Rechte sowie Geräte-Abos prüfen. Für längere Verfügbarkeit gehört der Dienst auf einen dauerhaft laufenden Homeserver; der Mac muss angemeldet, eingeschaltet und wach sein.

## Prüfen

```sh
npm test
npm run test:ntfy
# Bei Docker: CONTAINER_RUNTIME=docker npm run test:ntfy
podman compose --profile notifications ps
```

Der Integrationstest verwendet einen isolierten echten ntfy-Container und zufällige Testzugänge, ohne Amazon-Account oder ntfy.sh-Relay. Er prüft verbotene anonyme Zugriffe, getrennte Lese-/Schreibrechte, andere Kanäle, echte Stream-Zustellung, private Auth-Dateirechte und den Widerruf eines Gerätezugs. Der Testcontainer und sein Testvolume werden danach entfernt.
