# Kontomanager

Finanz-Dashboard für den Raspberry Pi: Monatsübersicht mit Budget vs. Ist pro Kategorie, synchronisiert aus einer Excel-Datei auf Google Drive (oder nativem Google Sheet).

## Voraussetzungen

| Komponente | Version |
|------------|---------|
| Python | 3.12 |
| Node.js / npm | 20+ |
| Docker (optional) | für Deploy auf dem Pi |

## Architektur

- **Backend:** Python 3.12, FastAPI, SQLite, APScheduler
- **Frontend:** React + TypeScript + Vite (Static Build)
- **Deploy:** Docker Compose auf dem Pi (ARM64)

### Datenfluss

```
Google Drive / Sheet  →  Sync-Worker  →  Parser  →  SQLite  →  REST-API  →  React-UI
```

1. Der **Sync-Worker** lädt die Excel- oder Sheet-Datei über die Google APIs herunter.
2. Der **Parser** (`backend/sync/parser_config.yaml`) extrahiert Budget und Ist-Ausgaben pro Kategorie und Monat.
3. Die Daten landen in **SQLite** (`data/kontomanager.db`).
4. **FastAPI** stellt die REST-API bereit und liefert im Produktionsmodus das gebaute Frontend aus `static/`.
5. **APScheduler** startet beim Hochfahren einen Sync und wiederholt ihn danach periodisch (Standard: alle 30 Minuten).

## Projektstruktur

```
Kontomanager/
├── backend/
│   ├── api/              # REST-Routen (/api/...)
│   ├── db/               # SQLite-Schema und Repository
│   ├── sync/             # Google-Download, Parser, Scheduler
│   ├── scripts/          # Hilfsskripte (z. B. analyze_sheet)
│   ├── config.py         # Einstellungen aus .env
│   └── main.py           # FastAPI-Einstiegspunkt
├── frontend/             # React-App (Dev-Server)
├── static/               # Gebautes Frontend (vom Backend ausgeliefert)
├── data/                 # SQLite-Datenbank (gitignored)
├── secrets/              # Google Service Account JSON (gitignored)
├── docs/                 # Sheet-Dokumentation
├── run.bat / run.sh      # Backend-Starter
├── Dockerfile            # Multi-Stage Build (Node → Python)
└── docker-compose.yml
```

## Funktionen (UI)

- Monats- und Jahresübersicht (Budget vs. Ist pro Kategorie)
- KPI-Karten mit Gesamtbudget, Ausgaben und Rest
- Verbrauch in Prozent pro Kategorie
- Trend-Indikatoren (hoch / runter / gleichbleibend vs. Vormonat)
- Manueller Sync-Trigger in der Oberfläche

## Google Cloud Setup (Service Account)

1. [Google Cloud Console](https://console.cloud.google.com/) → neues Projekt anlegen
2. **Google Drive API** aktivieren (für Excel-Dateien auf Drive)
3. **Google Sheets API** aktivieren (falls du ein natives Google Sheet nutzt)
4. **IAM & Admin → Service Accounts** → Service Account erstellen
5. Schlüssel erstellen (JSON) → als `secrets/google-service-account.json` speichern
6. Excel-Datei auf Google Drive öffnen → **Teilen** → Service-Account-E-Mail (z. B. `kontomanager@...iam.gserviceaccount.com`) mit **Leserecht** hinzufügen

Die Spreadsheet-ID findest du in der URL der Datei:
`https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`

## Konfiguration

```bash
cp .env.example .env
# .env bei Bedarf anpassen
```

| Variable | Beschreibung | Standard |
|----------|--------------|----------|
| `SPREADSHEET_ID` | ID der Excel-/Sheet-Datei auf Google Drive | siehe `.env.example` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Pfad zum Service-Account-JSON | `./secrets/google-service-account.json` |
| `DATABASE_PATH` | Pfad zur SQLite-Datenbank | `./data/kontomanager.db` |
| `PARSER_CONFIG_PATH` | YAML-Konfiguration für den Sheet-Parser | `./backend/sync/parser_config.yaml` |
| `SYNC_INTERVAL_MINUTES` | Intervall für automatischen Sync | `30` |
| `SYNC_ON_STARTUP` | Sync direkt beim Start ausführen | `true` |
| `STATIC_DIR` | Ordner mit gebautem Frontend | `./static` |
| `USE_SAMPLE_DATA` | Beispieldaten ohne Google-Credentials | `false` |

Sheet-Struktur und Parser: siehe [docs/SHEET_STRUCTURE.md](docs/SHEET_STRUCTURE.md)

Nach dem Teilen des Sheets:

```bash
python -m backend.scripts.analyze_sheet
```

Ausgabe prüfen und ggf. `backend/sync/parser_config.yaml` anpassen.

## Lokale Entwicklung

Für die Entwicklung mit Hot-Reload brauchst du **zwei Server gleichzeitig**:

| Server | URL | Rolle |
|--------|-----|-------|
| Backend (FastAPI) | `http://localhost:8080` | API + optional gebautes Frontend |
| Frontend (Vite) | `http://localhost:5173` | UI mit Hot-Reload |

Im Dev-Modus proxied Vite alle `/api`-Anfragen an Port 8080. Öffne die App unter `http://localhost:5173`.

### Backend starten

Abhängigkeiten liegen in der **virtuellen Umgebung** (`.venv`). Ohne Aktivierung findet das globale `uvicorn` kein FastAPI.

**Windows (empfohlen):**

```bat
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
run.bat
```

**Oder manuell mit aktiviertem venv:**

```bash
python -m venv .venv
.venv\Scripts\activate          # Git Bash / CMD
pip install -r requirements.txt
python -m uvicorn backend.main:app --port 8080
```

**Linux / macOS:**

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
./run.sh
```

Mit echten Excel-Daten, sobald `secrets/google-service-account.json` liegt (kein `USE_SAMPLE_DATA` nötig).

### Backend (nur Beispieldaten, ohne Google)

**Linux / macOS:**

```bash
USE_SAMPLE_DATA=true .venv/bin/python -m uvicorn backend.main:app --reload --port 8080
```

**Windows (CMD oder Git Bash):**

```bat
set USE_SAMPLE_DATA=true
.venv\Scripts\python -m uvicorn backend.main:app --reload --port 8080
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Produktions-Build lokal

```bash
cd frontend && npm run build
# Output landet automatisch in ../static
.venv\Scripts\python -m uvicorn backend.main:app --port 8080
```

Danach alles unter `http://localhost:8080` — Backend liefert API und Frontend aus einem Server.

## Docker (Raspberry Pi)

```bash
docker compose up -d --build
```

App erreichbar unter `http://<pi-ip>:8080`

Volumes:
- `./data` — SQLite-Datenbank
- `./secrets` — Google Service Account JSON (read-only)

## API

| Endpoint | Beschreibung |
|----------|--------------|
| `GET /api/months` | Verfügbare Monate und Jahre |
| `GET /api/overview?month=2025-06` | Budget-Übersicht für einen Monat |
| `GET /api/overview?month=2025` | Budget-Übersicht für ein ganzes Jahr |
| `GET /api/categories/{id}/monthly?year=2026` | Monatsverlauf einer Kategorie |
| `GET /api/sync/status` | Letzter Sync |
| `POST /api/sync/trigger` | Manueller Sync |

OpenAPI-Dokumentation: `/docs`
