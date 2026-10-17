# Sawin Bauelemente App

Büro-App für Sawin Bauelemente: Kunden, Anfragen, Aufträge, Belege über Lexware, Aufgaben und Montageplan.

## Lokal starten

```bash
npm install
cp .env.example .env.local   # Werte eintragen
npm run dev                  # http://localhost:3000
```

Das Designsystem mit allen Bausteinen liegt unter `/styleguide`.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `src/styles/tokens.css` | Basis-Tokens für alle Kunden |
| `src/customers/<kunde>/` | Kunden-Theme, Logo, Konfiguration, Sonderkomponenten |
| `src/components/ui/` | Allgemeine Bausteine (Button, Badge, Card, Field, Select, Table, Dialog) |
| `src/components/app/` | App-Bausteine (App-Rahmen, Navigation, Kennzahl, Pipeline-Karte) |
| `src/lib/` | Hilfsfunktionen (Formatierung, Status) |

Regeln für die Weiterentwicklung stehen in `CLAUDE.md`.
