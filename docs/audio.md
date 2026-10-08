# Kurzen Audioclip vorbereiten

Ein lokaler Hilfsbefehl schneidet einen YouTube- oder lokalen Audioausschnitt. Start und Dauer sind Sekunden; Dezimalwerte sind möglich (0,1–30 Sekunden). Werkzeuge einmal auf dem Mac installieren:

```sh
brew install yt-dlp ffmpeg
npm run audio:prepare -- 'https://www.youtube.com/watch?v=3tbiUw6tXfE' 58 4.5
# Alternativ lokale Datei:
npm run audio:prepare -- /pfad/zur/aufnahme.mp3 58 4.5
```

Ergebnis: `data/audio/ring.mp3`, Stereo, 24 kHz, 48 kbit/s. Die Quelle und der Clip bleiben lokal außerhalb von Git und Projektarchiv. Encoder-Padding kann die MP3-Dateidauer um wenige Millisekunden verlängern.

## Ergebnis des Echo-Tests vom 08.10.2026

Der Ausschnitt 00:58–01:02,5 wurde erzeugt, über HTTPS bytegenau geprüft und auf dem Echo ausprobiert. Die API akzeptierte die Aufrufe, aber `AlexaAnnouncement`/SSML blieb ohne hörbaren Clip; der Speak-Weg mit Audio-Markup führte laut Benutzer zu einer Skill-Zugriffsfehlermeldung. Das ist keine erfolgreiche Audio-Wiedergabe. Die normale Klingel wurde auf den vorherigen Speak-Text zurückgestellt. Der erfolglose direkte Ansatz wurde entfernt. Eigene MP3s werden jetzt ausschließlich als Antwort des zusätzlich eingerichteten Custom-Skill-Endpunkts bereitgestellt, nicht als direkte Routinen-Ansage.

Auch die [Dokumentation von Alexa Media Player](https://github.com/alandtse/alexa_media_player/wiki/Configuration:-Notification-Component) nimmt den Audio-Tag ausdrücklich von der SSML-Announce-Unterstützung aus. Die allgemeine MP3-Unterstützung in Alexa-Skill-Antworten ist deshalb kein Nachweis für diesen privaten Routinen-/Ansageweg.

Für eigene Clips wurde ein separat umschaltbarer Custom-Skill vorbereitet: [alexa-skill.md](alexa-skill.md). Die Registrierung und echte Wiedergabe müssen in Amazons Developer Console/auf dem Echo abgeschlossen werden; AWS Lambda oder kostenpflichtige Dienste wurden nicht eingerichtet. Amazon-eigene Routinen-Sounds sind ein separater Weg (`Alexa.Sound`), kein eigener MP3-Upload.
