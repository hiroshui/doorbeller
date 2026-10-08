# Separater Musik-Skill: Dungeon Klingel

Der eigene Custom-Skill ist ein zusätzlicher Ausgabeweg. Die bisherige Ansage bleibt erhalten und lässt sich jederzeit auswählen. Beide verwenden dieselben ausgewählten Echos; ntfy und Mac-Mitteilungen bleiben unabhängig. Ein neuer Skill muss einmal in Amazons Developer Console registriert und auf dem tatsächlichen Echo getestet werden. Der Gateway allein registriert oder aktiviert keinen Amazon-Skill.

## Bereits vorbereiteter Server

Am 08.10.2026 in der Console eingerichtet und im Development-Modus aktiviert. Echter Simulator-Aufruf und automatischer Start per Skill-ID aus einem authentifizierten Ring-Test bestanden; die physische Hörprobe steht noch aus. Lokal ist `ALEXA_OUTPUT=skill` aktiviert.

- HTTPS-Endpunkt: `https://doorbird.hiroshui.men/alexa/skill`
- Sprache/Aufrufname: Deutsch (DE), **dungeon klingel**
- Clip: `data/audio/ring.mp3`, YouTube 00:58–01:02,5; Vorbereitung siehe [audio.md](audio.md).
- Serverbetrieb: bestehender Node-Gateway, Docker/Podman, bestehender Cloudflare-Tunnel. Kein weiterer Hostname, AWS Lambda oder eigener öffentlicher Host-Port nötig.

Lokale Console-Dateien passend zu `.env` erzeugen:

```sh
npm run skill:prepare
```

Sie liegen in `data/alexa-skill/interaction-model.json` und `data/alexa-skill/skill.json`. Die generischen Vorlagen liegen unter `skills/dungeon-klingel/`. Der Interaktionsmodell-JSON ist für den JSON-Editor der Console; das Manifest ist eine zusätzliche Vorlage für ASK CLI/SMAPI, kein Modell-JSON.

## Einmal bei Amazon anlegen

1. [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) mit **dem Amazon-Account deiner Echos** öffnen.
2. Neuen Skill **Dungeon Klingel**, Sprache **Deutsch (DE)**, Modell **Custom**, Hosting **Provision your own/eigener Server** anlegen. Leere Vorlage wählen; keine kostenpflichtigen Dienste einrichten.
3. Die neue ID `amzn1.ask.skill.…` in `.env` als `ALEXA_SKILL_ID` eintragen. Die ID ist kein Passwort und kein API-Token.
4. Unter **Interaction Model → JSON Editor** den Inhalt von `data/alexa-skill/interaction-model.json` einfügen, speichern und **Build Model** ausführen.
5. Unter **Endpoint**: **HTTPS**, Default `https://doorbird.hiroshui.men/alexa/skill`. Beim aktuellen Cloudflare-Zertifikat die Option für ein **Wildcard-Zertifikat einer vertrauenswürdigen CA** auswählen. Bei anderer Domain den tatsächlich passenden Zertifikatstyp wählen.
6. Gateway wie unten neu laden. Ohne korrekte konfigurierte Skill-ID antwortet der Endpoint absichtlich 503. Zertifikats-/Signaturprüfung nicht für Console-Tests abschalten.
7. Unter **Test** auf **Development** stellen. Eigene Entwicklungsskills lassen sich auf Geräten desselben Amazon-Accounts testen; eine öffentliche Store-Veröffentlichung ist dafür nicht erforderlich.
8. Zuerst auf dem Echo sagen: **„Alexa, öffne dungeon klingel“**. Erwartet: Clip und Ansage. Erst nach diesem hörbaren Test den automatischen Skill-Start beim Klingeln prüfen.

## Umschalten ohne Umbau

`.env`, bisherige funktionierende Ausgabe:

```dotenv
ALEXA_OUTPUT=speak
```

Zusätzlichen Skill vorbereiten/konfigurieren, auch solange `speak` ausgewählt bleibt:

```dotenv
ALEXA_SKILL_AUDIO_FILE=/audio/ring.mp3
ALEXA_SKILL_BASE_URL=https://doorbird.hiroshui.men
ALEXA_SKILL_ID=amzn1.ask.skill.DEINE-TATSAECHLICHE-UUID
ALEXA_SKILL_AUDIO_ORDER=before
ALEXA_SKILL_LAUNCH=id
ALEXA_SKILL_INVOCATION=dungeon klingel
```

`ALEXA_SKILL_AUDIO_ORDER=before` spielt Clip → `ANNOUNCEMENT`, `after` Ansage → Clip, `only` nur Clip. Vorhandene lokale SSML-Fragmente wie `<lang xml:lang="en-US">…</lang>` bleiben erhalten. Der Clip und die Ansage sind eine gemeinsame Skill-Antwort; es werden nicht zwei zeitlich konkurrierende Wiedergabebefehle gesendet.

Nach erfolgreichem manuellen Test beim Klingeln aktivieren:

```dotenv
ALEXA_OUTPUT=skill
```

Laden nach jeder `.env`- oder Clip-Änderung:

```sh
# Einmal beim Update auf diese Version:
podman compose build gateway
# Danach auch bei allen Konfigurations-/Clip-Änderungen:
podman compose --profile notifications --profile tunnel up -d --force-recreate gateway ntfy cloudflared
```

Mit `ALEXA_OUTPUT=speak` und demselben Ladebefehl jederzeit zurückwechseln. Der Skill bleibt dann weiterhin separat per Stimme aufrufbar. Nicht auf `skill` schalten, solange ID/Endpoint fehlen: Der Start wird dann zur Vermeidung einer unbrauchbaren Ausgabe abgewiesen.

Automatischer Start: `ALEXA_SKILL_LAUNCH=id` verwendet die geprüfte Bibliotheksfunktion `skill` (Skill-Launch über Routinen). Falls Amazon den Development-Skill darüber nicht startet, kann nach erfolgreichem Sprachtest **explizit** `ALEXA_SKILL_LAUNCH=text` gewählt werden. Dann sendet der Gateway `öffne dungeon klingel` über `textCommand`. Beide müssen auf dem Echo praktisch bestätigt werden. Es gibt keinen automatischen zweiten Versuch/Fallback: Ein akzeptierter HTTP-Aufruf kann bereits eine Wiedergabe ausgelöst haben.

## Sicherheit und Grenzen

Der Skill-Endpunkt akzeptiert nur signierte Amazon-Anfragen mit der eigenen Skill-ID. RSA-SHA256 wird gegen den **unveränderten Request-Body** geprüft. Der Zertifikatsabruf ist auf den dokumentierten HTTPS-Amazon-S3-Pfad beschränkt (kein Redirect), begrenzt und zeitlich beschränkt. Native OpenSSL-Prüfung validiert vollständige CA-Kette, Gültigkeit und `echo-api.amazon.com` als SAN; Node führt die Request-Signaturprüfung aus. Zeitstempel müssen innerhalb ±150 Sekunden liegen; ungültige/future/untrusted Anfragen werden abgewiesen. Maximal vier parallele Prüfungen, Bodylimit 64 KiB, Zertifikatslimit 64 KiB, begrenzter Zertifikatscache. Keine Bodies, IDs, Signaturen oder Zertifikat-URLs in Logs. Der Endpunkt löst selbst keine Ring-/Alexa-Befehle aus.

Für zusätzliche Kontobeschränkung kann die **skill-spezifische** `userId` aus einem eigenen signierten Console-Test als `ALEXA_SKILL_USER_ID` in `.env` hinterlegt werden; das ist weder die Echo-Seriennummer noch die E-Mail-Adresse. Ohne diese Einstellung ist der Skill im Development-Modus für den eigenen Entwickler-Account gedacht. Nicht ungeprüft öffentlich veröffentlichen; andere zugelassene Skill-Benutzer würden sonst ebenfalls die konfigurierte Antwort erhalten.

Amazon muss die MP3 ohne Anmeldung abrufen können. Ausschließlich der konfigurierte Clip wird unter einer aus seinem Inhalt abgeleiteten SHA-256-Adresse öffentlich ausgeliefert, inklusive HEAD und Byte-Ranges. Der Hash ist **keine Authentifizierung**: Keine vertraulichen Aufnahmen verwenden. Es gibt keine Upload- oder Verzeichnisroute; Ring-Token und Session werden nicht eingebettet. Dateigröße maximal 2 MiB. Die Datei wird beim Gateway-Start geladen; neue Clips benötigen einen Neustart.

OpenSSL ist im Gateway-Image enthalten. Für lokale Node-Ausführung muss `openssl` verfügbar sein. Es wurden keine neuen npm-Abhängigkeiten hinzugefügt: Der offizielle ASK-Express-Adapter verwendet derzeit eine ungepatchte node-forge-Signaturprüfungslücke ([GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv)); deshalb wird diese Abhängigkeit hier nicht eingesetzt.

Ein erfolgreicher API-Aufruf/`skill_clip_response` bestätigt nur den akzeptierten Aufruf bzw. die erzeugte Skill-Antwort. **Hörbare Clip-Ausgabe, korrekte Reihenfolge und automatischer Start sind erst nach Echo-Test bestätigt.** Development-Modus/Skill-Verfügbarkeit, laufende Medien und Amazon-/Internet-Ausfälle können das Verhalten beeinflussen. Exakt synchrones Abspielen auf mehreren Echos wird nicht zugesichert.

Quellen: [HTTPS-Webservice und Prüfanforderungen](https://developer.amazon.com/en-US/docs/alexa/custom-skills/host-a-custom-skill-as-a-web-service.html), [MP3/SSML in Custom Skills](https://developer.amazon.com/en-US/docs/alexa/custom-skills/add-audio.html), [Development-Test auf eigenen Echos](https://developer.amazon.com/en-US/docs/alexa/test/test-your-skill-overview.html).
