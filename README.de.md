# City Runner

Ein Panzerspiel fuer den Browser. Keine Installation, keine Anmeldung, keine Werbung — einfach oeffnen und spielen.

Ich habe es gebaut, weil ich ein Panzerspiel wollte, das ich in der Pause auf dem Handy starten kann, ohne auf irgendetwas zu warten. Wie sich herausstellt, wollten das ein paar andere Leute auch.

## Der Aufbau

Es gibt hier zwei Ebenen.

Die erste ist eine schnelle Panzerschlacht. Du faehrst, zielst und schiesst — du drueckst dich durch Wellen feindlicher Panzer ueber offenes Gelaende, durch Staedte und Waelder. Die Munitionsart spielt eine Rolle. Der Winkel auch. Eine saubere APCR-Granate in die Flanke eines Panthers fuehlt sich ganz anders an als HE-Spray gegen die Front.

Die zweite Ebene ist die Kriegskarte. Du beginnst mit drei Sektoren an der europaeischen Front. Jeder Sektor produziert etwas — Treibstoff, Munition oder Industrie. Davon kaufst du Rekruten, Upgrades, Forts und irgendwann Atomsprengkoepfe. Diese Einheiten setzt du dann auf angrenzenden Sektoren ein und laesst die Schlacht auf dem Feld entscheiden.

Verlierst du einen Sektor, drueckt der Feind weiter nach. Nimmst du einen, weitet sich deine Front. Die Karte ist keine Dekoration — sie ist die ganze Kampagne.

## Voraussetzungen

Node.js 18 oder neuer.

    npm install
    npm start

Dann http://localhost:3000 im Browser oeffnen.

## Steuerung

- Linker Stick — Fahren
- Rechter Stick — Turm drehen
- FEUER — Schiessen
- AP / APCR / HEAT / HE — Munition wechseln
- Faehigkeiten-Reihe — Artillerie, Reparatur, Nebel, Luftschlag, Feuerloescher

## Schwierigkeit

- LEICHT — vier Startsektoren, weniger Feinde. Gut zum Kennenlernen.
- NORMAL — drei Startsektoren. Die gedachte Erfahrung.
- SCHWER — ein Sektor, mehr Feinde, keine Schonung.

Nach jedem Aufgeben oder Neustart gibt es ein 90-Sekunden-Fenster, in dem der Feind pausiert. Nutze es zum Planen.

## Was im Spiel steckt

- Fuenf Kontinente mit eigenem Feindmultiplikator und Freischaltkosten
- Nothilfe — eine Ressourcenlieferung pro Stunde, wenn es schlecht laeuft
- Atomschlaege — 300 Industrie, 150 Treibstoff, 150 Munition, etwa drei Minuten Produktion
- Versorgungslinien ueber Forts (60 Industrie, 40 Munition pro Fort)
- Tagesbelohnungen mit einem markierten Sektor, der 200 Industrie ausschuettet
- Vier Kommandantentypen — Iron Fist, Thunder, Hammer, Storm
- WebRTC-Peer-to-Peer-Mehrspieler (frueh, noch rau)

## Technik

- Three.js fuer das Rendering
- Express fuer das schlanke Backend
- @noble/post-quantum fuer signierte Leaderboard-Eintraege (ML-KEM-768, ML-DSA-65)
- PeerJS fuer den Mehrspieler-Transport

## Sprachen

Englisch, Deutsch, Russisch, Arabisch. Der Sprachumschalter im Spiel sitzt oben am Bildschirm.

## Ein Hinweis zum Code

Das Kriegsmodul (war-module.js) laedt nach dem Hauptspiel und injiziert seine eigene Oberflaeche. Es haelt seinen eigenen Zustand in localStorage unter steel_front_war_v2. Um die Karte zurueckzusetzen, nutze den SURRENDER-Knopf — er leert Sektoren, Einheiten und Forts, behaelt aber die Ressourcen, die ueber Kontinente hinweg bestehen bleiben sollen.

## Lizenz

MIT. Nutze es, forke es, veroeffentliche es, verkaufe es, mach was du willst.

— lamin
