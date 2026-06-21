# Kontomanager

Finanz-Dashboard für den Raspberry Pi: Monatsübersicht mit Budget vs. Ist pro Kategorie, synchronisiert aus einer Excel-Datei auf Google Drive (oder nativem Google Sheet).

## Architektur

- **Backend:** Python 3.12, FastAPI, SQLite, APScheduler
- **Frontend:** React + Vite (Static Build)
- **Deploy:** Docker Compose auf dem Pi (ARM64)

## Google Cloud Setup (Service Account)

1. [Google Cloud Console](https://console.cloud.google.com/) → neues Projekt anlegen
2. **Google Drive API** aktivieren (für Excel-Dateien auf Drive)
3. **Google Sheets API** aktivieren (falls du ein natives Google Sheet nutzt)
4. **IAM & Admin → Service Accounts** → Service Account erstellen
5. Schlüssel erstellen (JSON) → als `secrets/google-service-account.json` speichern
6. Excel-Datei auf Google Drive öffnen → **Teilen** → Service-Account-E-Mail (z.B. `kontomanager@...iam.gserviceaccount.com`) mit **Leserecht** hinzufügen

## Konfiguration

```bash
cp .env.example .env
# .env bei Bedarf anpassen
```

Sheet-Struktur und Parser: siehe [docs/SHEET_STRUCTURE.md](docs/SHEET_STRUCTURE.md)

Nach dem Teilen des Sheets:

```bash
python -m backend.scripts.analyze_sheet
```

Ausgabe prüfen und ggf. `backend/sync/parser_config.yaml` anpassen.

## Lokale Entwicklung

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

App unter `http://localhost:8080` — mit echten Excel-Daten, sobald `secrets/google-service-account.json` liegt (kein `USE_SAMPLE_DATA` nötig).

### Backend (nur Beispieldaten, ohne Google)

```bash
USE_SAMPLE_DATA=true .venv\Scripts\python -m uvicorn backend.main:app --reload --port 8080
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Dev-Server proxied API-Anfragen an `localhost:8080`.

### Produktions-Build lokal

```bash
cd frontend && npm run build
# Output nach ../static kopieren (npm run build macht das automatisch)
USE_SAMPLE_DATA=true .venv\Scripts\python -m uvicorn backend.main:app --port 8080
```

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
| `GET /api/months` | Verfügbare Monate |
| `GET /api/overview?month=2025-06` | Budget-Übersicht |
| `GET /api/sync/status` | Letzter Sync |
| `POST /api/sync/trigger` | Manueller Sync |

OpenAPI-Dokumentation: `/docs`
