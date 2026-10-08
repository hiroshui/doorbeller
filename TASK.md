Arbeitsauftrag: DoorBird → Alexa für Börßum
Ziel und Kontext
Maxi Krone möchte seine zurückgesetzte, im WLAN eingebundene DoorBird als Auslöser für Ansagen auf seinen Echo-Geräten verwenden. Zunächst läuft der Dienst auf einem MacBook Pro mit Apple Silicon, später auf einem Homeserver. Python ist ausdrücklich bevorzugt. Alle Dienste laufen in Containern. Ein Cloudflare Tunnel soll die API von außen erreichbar machen, ohne Router-Portfreigabe. Vorgesehene Domain aus dem Gespräch: hiroshui.men; doorbird.hiroshui.men ist ein Vorschlag, keine bestätigte Konfiguration.
Umsetzung
1. Aktuelle Primärquellen von DoorBird, Cloudflare und Alexa-Clientprojekten prüfen. Vorherigen Beispielcode nicht ungeprüft übernehmen: Versionen, Auth-Events, Registration-Daten und Speak-Methoden müssen am aktuellen Quellcode verifiziert werden.
2. Einen gepflegten Python-Alexa-Client auf Login, Deutschland-Unterstützung, Refresh, Session-Persistenz und Ansagen prüfen. Keine improvisierte Implementierung privater Amazon-Endpunkte. Wenn Python dafür nicht verlässlich geeignet ist, Python/FastAPI als Gateway und einen minimalen internen Node-Adapter mit geprüftem alexa-remote2 verwenden. Entscheidung dokumentieren.
3. Architektur: DoorBird → HTTPS/Cloudflare Tunnel → Python/FastAPI → Alexa-Client bzw. interner Adapter → Amazon → ausgewählte Echo-Geräte.
4. Compose mit Gateway, cloudflared und gegebenenfalls Alexa-Adapter erstellen. Apple Silicon und spätere Linux/amd64-Nutzung berücksichtigen. Tunnel-Ziel ist der interne Gateway-Dienst. API im Normalbetrieb ohne öffentlichen Host-Port; lokale Testports allenfalls an 127.0.0.1 binden.
5. Authentifizierte GET- und POST-Klingelroute. DoorBirds tatsächlich unterstützte Auth-Möglichkeiten prüfen. Header-Token bevorzugen, wenn das Gerät sie unterstützt; andernfalls starkes zufälliges URL-Token. URL-Pfade und Query-Tokens aus allen eigenen Logs entfernen. Ein Secret-Pfad allein ist kein Ersatz für Authentifizierung. Kein Cloudflare Access Browser-Login vor dem Geräte-WebHook.
6. Debounce gegen mehrfache Klingelereignisse, begrenzte Queue und klare Überlastantworten. Erst nach erfolgreicher Aufnahme 202 liefern; nicht auf Amazon warten. Fehler transparent protokollieren. Keine verspäteten Ansagen nach längerem Ausfall und keine blinden Wiederholungen mit doppelten Ansagen.
7. Liveness und Readiness trennen. Alexa-Status und Auth-Erneuerung sauber führen. Timeouts, sauberes Shutdown und kontrollierte Neustarts vorsehen.
8. Amazon-Passwort nicht in Konfiguration speichern. Verifizierten interaktiven Login mit MFA vorsehen. Session-/Refresh-Daten persistent und mit restriktiven Rechten speichern; niemals in Logs oder Git. Login-Oberfläche nur lokal und nur während der Einrichtung erreichbar machen.
9. Zielgeräte per Namen oder Seriennummer konfigurierbar; alle Ziele vor Ausführung validieren. Standardansage: „Es hat an der Haustür geklingelt.“
10. Deutsche Schritt-für-Schritt-Anleitung: Container-Runtime auf dem Mac, Start, Erstlogin, Test, Cloudflare-Tunnel-Anbindung, DoorBird HTTP-Aufruf und dauerhafter Klingelzeitplan, Betrieb und Migration. Mac muss eingeschaltet und wach sein; der Tunnel umgeht keinen Ruhezustand. Internet-Abhängigkeit der Echo-Ansage klar benennen.
Lieferumfang
- Vollständiger Quellcode mit modularer Struktur und geprüften Dependencies.
- Dockerfiles, compose.yaml, .env.example, .gitignore.
- Persistente Session-Volumes, Token-Generierung und minimaler Cloudflare-Konfigurationsweg.
- README.md auf Deutsch und kurze Architektur-/Entscheidungsnotiz.
- Reproduzierbare Tests ohne echte Amazon-Zugangsdaten: Authfehler, gültiger Aufruf, Debounce, Queue voll, Alexa-Ausfall, Timeouts und Teilausfall mehrerer Ziele.
- Compose-/Build-Prüfung soweit Runtime verfügbar. Echtgeräte- und Login-Tests ausdrücklich als offen kennzeichnen, solange nicht ausgeführt.
- Downloadbares Projektarchiv und knapper Bericht mit Tests und verbleibenden Einrichtungsschritten.
Noch benötigte Angaben / Handgriffe
- Tatsächlicher Cloudflare Tunnel und gewünschter Hostname.
- Tunnel-Token lokal als Secret eintragen; nicht im Chat verlangen.
- Echo-Namen oder Seriennummern.
- DoorBird-Modell/App-Stand für genaue Menüs.
- Interaktiver Amazon-Login und Klingeltest durch Maxi.
  Diese Angaben blockieren die Implementierung nicht: sichere Platzhalter und konkrete Einrichtungsschritte liefern.
Grenzen
Kein Zugriff auf den Mac, Amazon, DoorBird oder Cloudflare voraussetzen. Keine erfolgreiche Veröffentlichung oder funktionierende Echtansage behaupten, wenn nicht getestet. Keine zusätzlichen Abos, AWS Developer Skills oder kostenpflichtigen Dienste voraussetzen. Hausbau-PDFs sind für dieses Projekt irrelevant.

Die Programmiersprache ist frei wählbar. Verwende die einfachste, wartungsärmste Lösung. Wenn Alexa mit Node.js und alexa-remote2 am zuverlässigsten steuerbar ist, implementiere den gesamten Gateway in Node.js. Python und ein zusätzlicher Sidecar sind nicht erforderlich. Bevorzuge einen einzigen Gateway-Container; Cloudflare bleibt ein optionaler zusätzlicher Dienst. Alle übrigen Anforderungen gelten weiterhin.
