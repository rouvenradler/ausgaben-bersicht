# Google Sheet / Excel Struktur

Spreadsheet-ID: `1o3NK9Bypgr2NtbwgwMy9kgUpZ9V_tsRX`

Die Datenquelle ist eine **Excel-Datei (.xlsx) auf Google Drive**. Der Sync lädt die Datei über die **Google Drive API** herunter und parst sie mit openpyxl. Native Google Sheets werden alternativ über die Sheets API gelesen.

## Erwartetes Layout (konfigurierbar)

Der Parser unterstützt drei Modi (siehe `backend/sync/parser_config.yaml`):

### 1. `overview_matrix` (2026_Finanzplanung.xlsx)

Tab `2026` (Jahreszahl): Zeile 2 = Header mit Monaten Jan–Dec, Spalte `max/m` = monatliches Budget pro Kategorie, Monatsspalten = Ist-Ausgaben.

| Kategorie   | Jan   | Feb   | … | Summe | ⌀   | max/m (Budget) |
|-------------|-------|-------|---|-------|-----|----------------|
| Lebensmittel| 256.25| 595.94| … | …     | …   | 500            |

Transaktions-Tabs (`2026_1`, `2026_6_R`, …) werden nicht für das Dashboard genutzt.

### 2. `monthly_tabs`

Ein Tab pro Monat, Tab-Name im Format `YYYY-MM` (z.B. `2025-06`).

| Kategorie   | Budget | Ist    | Rest   |
|-------------|--------|--------|--------|
| Lebensmittel| 400    | 312,50 | 87,50  |
| Restaurant  | 150    | 178,20 | -28,20 |
| Transport   | 80     | 45,00  | 35,00  |

- Spalte A: Kategorie
- Spalte B: Budget
- Spalte C: Ist (Ausgaben)
- Spalte D: Rest (optional, wird sonst berechnet)

### 2. `flat_table`

Eine Tabelle mit Spalten `Monat`, `Kategorie`, `Budget`, `Ist`.

### 3. `overview_matrix`

Ein Tab mit Monatsblöcken nebeneinander (für komplexere Sheets).

## Sheet analysieren

1. Service Account anlegen (siehe README)
2. **Google Drive API** im GCP-Projekt aktivieren
3. Excel-Datei mit der Service-Account-E-Mail teilen (Leserecht)
4. Credentials nach `secrets/google-service-account.json` legen
5. Analyse ausführen:

```bash
python -m backend.scripts.analyze_sheet
```

Die Ausgabe zeigt Tab-Namen, Header und Beispielzeilen — damit `parser_config.yaml` angepasst werden kann.

## Lokale Entwicklung ohne Google

```bash
USE_SAMPLE_DATA=true uvicorn backend.main:app --reload
```

Lädt Beispieldaten aus `backend/fixtures/sample_sheet.json`.
