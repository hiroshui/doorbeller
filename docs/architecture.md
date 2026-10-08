# Architektur und Entscheidungen

Ein Node.js-Gateway mit alexa-remote2 **8.1.1** verarbeitet authentifizierte DoorBird-Aufrufe; Cloudflare Tunnel macht die API ohne Router-Portfreigabe erreichbar. Optional liefert **ntfy 2.29.0** Push-Nachrichten an fertige Handy- und Browser-Apps. Ein lokaler macOS-LaunchAgent hält Podman/Gateway/Tunnel/ntfy am Laufen und zeigt native Mitteilungen. Kein Python-Sidecar, kein selbst implementierter Amazon-Endpunkt, keine Developer Skill und kein AWS-Dienst.

```text
DoorBird → HTTPS /ring → Cloudflare → Node-Gateway
                                       ├─ alexa-remote2 → Amazon → online Echos
                                       ├─ ntfy → authentifizierte Handy-/PC-Abos
                                       └─ lokales Aufnahme-Log → Mac-Mitteilung
```

## Klingelverarbeitung

GET und POST prüfen ein starkes Token mit konstantzeitlichem Vergleich, bevorzugt im Bearer-Header; DoorBird verwendet ein URL-Token. Eigene Logs enthalten keine URLs, Header, Zielnamen oder Zugangsdaten. Erst nach Aufnahme liefert der Gateway 202. Debounce, begrenzte RAM-Queue und maximale Ereigniszeit verhindern Mehrfach-/Spätansagen. Ein Neustart verwirft ausstehende Ereignisse bewusst.

Ausgabewege arbeiten unabhängig: ntfy funktioniert auch bei Alexa-Ausfall. Readiness zeigt die einzelnen Zustände und ist erfüllt, sobald mindestens ein Ausgabeweg bereit ist. Bei einem Teilausfall wird ein erfolgreicher Weg nicht wiederholt; nur wenn alle verfügbaren Wege scheitern, wird die übrige Queue verworfen. Keine blinden Wiederholungen unklarer Sendevorgänge. Bereits versandte Requests oder Push-Anbieter können trotzdem später zustellen; es gibt keine Exactly-once-/Echtzeitgarantie.

`ECHO_TARGETS=all` wählt ausschließlich aktuell online gemeldete einzelne Echos mit Audio-Player-Fähigkeit. Alternativ bleiben exakte Namen/Seriennummern möglich; unbekannte, mehrdeutige oder offline gemeldete explizite Ziele verhindern die Echo-Ausgabe. Alle Ziele werden vor Versand geprüft. Push bleibt davon unabhängig. Verfügbarkeit wird alle 30 Sekunden erneut geprüft.

## Alexa und enger Upstream-Patch

Die installierten npm-Quellen wurden geprüft: amazon.de, interaktiver lokaler Proxy mit MFA, `cookie`-Event, vollständiges `cookieData`/`formerRegistrationData` inklusive Refresh-Token/`macDms`, täglicher Refresh und `sendSequenceCommand(serial, 'speak', text, callback)`. Der Login-Callback meldet zunächst Proxy-Start und später Auth-Erfolg. Session-Dateien liegen persistent, atomar geschrieben, in 0700-Verzeichnissen mit 0600-Dateirechten. Passwort/Session/Registration werden nicht protokolliert. Der Gateway öffnet keinen Login-Proxy.

`scripts/patch-alexa.cjs` ist version- und quellcodegeprüft sowie idempotent. Er meldet HTTP-Fehler auch bei JSON-Antworten, schließt Requests bei absoluter Deadline und erhält die Geräteidentität bei wiederholtem Proxy-Login. Behavior-Preview-Aufrufe verwenden den Bibliothekstransport ohne Auth-Refresh und mit deaktivierten automatischen Retrys. Andere Aufrufe bleiben Upstream-Aufrufe. Neue Upstream-Versionen erfordern eine bewusste Patch-Prüfung.

`cookie` wird kompatibel auf **0.7.2** überschrieben. npm audit meldet weiterhin **fünf High-Einträge aus einer transitiven Ursache**, [braces GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), über micromatch → http-proxy-middleware → alexa-cookie2 → alexa-remote2. Am geprüften Stand kein korrigiertes braces-Release; kein ungeprüfter Proxy-Hauptversionswechsel oder extremer Alexa-Downgrade. Der betroffene Login-Proxy ist ausschließlich lokal und zeitlich begrenzt aktiv. Kein Anspruch auf ein sauberes Audit.

## ntfy und Gerätezutritt

Der ntfy-Server läuft als UID 1000 mit schreibgeschütztem Root-Dateisystem, privaten Datenbank-Rechten, ohne Host-Port, ohne Signup, mit Default-ACL `deny-all`. Nur der Publisher darf `haustuer` schreiben; jedes Gerät erhält einen eigenen Benutzer ausschließlich mit Leserechten. Neue Zugänge sind einzeln widerrufbar. Die CLI-Skripte erzeugen Zufallspasswörter, native bcrypt-Hashes, einen Publisher-Token und VAPID-Schlüssel. Keine Secrets in Git, Image oder Archiv; keine Credential-Ausgabe beim Setup. Die private Host-Verzeichnisgrenze schützt bind-gemountete Konfigurationen vor anderen Host-Benutzern. Änderungen starten nur ntfy neu; Sessions und Browser-Schlüssel bleiben erhalten.

Das Gateway prüft Health und Publisher-Anmeldung. Veröffentlichungen verwenden JSON und ausschließlich Header-Auth mit Deadline, ohne Redirects oder Wiederholung. Klartext-HTTP ist nur für den internen `ntfy`-Host oder Loopback erlaubt, öffentliche Ziele benötigen HTTPS. Kein öffentlicher Admin-Zugang. Logs sind auf erlaubte Statusfelder beziehungsweise ntfy-Fehlerniveau begrenzt. Rate-Limits begrenzen Requests und Nachrichten.

Der ntfy-Meldungscache dauert nominell eine Minute und dient dem iOS-Abruf, nicht einem Klingelarchiv. Für schnelle iOS-Pushs ist der offizielle ntfy.sh-Poll-Relay konfiguriert; er erhält eine Abfragekennung, die App holt den Meldungstext authentifiziert vom eigenen Server. Web-Push verwendet persistente VAPID-Schlüssel und Abos. Betriebssystem-/Browser-/Fokus-Einstellungen bestimmen tatsächlichen Ton und Zustellung; kein garantierter eigener Klingelton oder Lautlos-Override.

## Geprüfte Primärquellen

- [DoorBird LAN API](https://www.doorbird.com/downloads/api_lan.pdf): HTTP(S)-Favoriten mit URL, optionale URL-Credentials und Wochenzeitpläne in 30-Minuten-Schritten; keine dokumentierten frei wählbaren ausgehenden Bearer-Header. Die Verwaltungs-API nutzt getrennt Basic/Digest.
- [alexa-remote2](https://github.com/Apollon77/alexa-remote) und [alexa-cookie2](https://github.com/Apollon77/alexa-cookie), installierte Versionen 8.1.1/5.0.6.
- [Cloudflare Token-Dateien](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/run-parameters/) und [Release 2026.10.0](https://github.com/cloudflare/cloudflared/releases/tag/2026.10.0).
- [ntfy-Konfiguration und ACLs](https://docs.ntfy.sh/config/), [Publish-API](https://docs.ntfy.sh/publish/), [Handy-App](https://docs.ntfy.sh/subscribe/phone/), [Web-App](https://docs.ntfy.sh/subscribe/web/) sowie Release/Dockerfile/CLI-Quellen des fixierten Releases [v2.29.0](https://github.com/binwiederhier/ntfy/releases/tag/v2.29.0).

Prüfstand: 08.10.2026. Echte Gerätezustellung und Browser-Banner werden nur dann als bestätigt geführt, wenn vor Ort geprüft; siehe Prüfbericht.
