"""Sheet-Struktur analysieren (Tabs, Header, Beispielzeilen)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from backend.config import get_settings
from backend.sync.sheets_client import create_sheets_client


def main() -> int:
    settings = get_settings()
    if not settings.credentials_path.exists():
        print(
            "Keine Credentials gefunden unter",
            settings.credentials_path,
            file=sys.stderr,
        )
        print("Lege google-service-account.json ab und teile das Sheet.", file=sys.stderr)
        return 1

    try:
        client = create_sheets_client(settings)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        print(
            "\nDrive API aktivieren:\n"
            "https://console.cloud.google.com/apis/library/drive.googleapis.com",
            file=sys.stderr,
        )
        return 1
    meta = client.get_spreadsheet_metadata()
    print(f"Spreadsheet: {meta['title']}")
    print(f"MIME type: {meta.get('mime_type', 'unknown')}")
    print(f"Tabs ({len(meta['sheets'])}):")
    for sheet in meta["sheets"]:
        print(f"  - {sheet['title']} ({sheet['row_count']} rows x {sheet['col_count']} cols)")

    print("\n--- Beispiel-Daten (erste 8 Zeilen pro Tab) ---")
    for sheet in meta["sheets"][:12]:
        title = sheet["title"]
        rows = client.get_sheet_values(title)
        preview = rows[:8]
        print(f"\n## Tab: {title}")
        for row in preview:
            safe = [str(c).encode("ascii", "replace").decode("ascii") for c in row]
            print("  ", safe)

    out = Path("docs/sheet_analysis_output.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "title": meta["title"],
        "sheets": [
            {
                "title": s["title"],
                "preview": client.get_sheet_values(s["title"])[:10],
            }
            for s in meta["sheets"]
        ],
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nVollständige Vorschau gespeichert: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
