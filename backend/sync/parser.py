from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import yaml

from backend.db.models import parse_year_month


@dataclass
class ParsedBudgetRow:
    year_month: str
    category: str
    budget_cents: int
    spent_cents: int
    sort_order: int


@dataclass
class ParsedAsset:
    name: str
    value_cents: int
    sort_order: int


@dataclass
class ParsedAssetAccount:
    group: str
    name: str
    iban: str
    value_cents: int
    sort_order: int
    institute: str = ""
    category: str = ""
    owner: str = ""
    as_of: str = ""
    rate_kind: str = ""
    rate_value: float = 0.0


@dataclass
class ParsedTransaction:
    year_month: str
    category: str
    booking_date: str
    payee: str
    amount_cents: int
    source_tab: str
    sort_order: int


_TX_TAB_RE = re.compile(r"^(\d{4})_(\d{1,2})(?:_([RL]))?$")
_TX_HEADER_ALIASES = {
    "booking_date": ("buchungsdatum",),
    "payee": ("zahlungsempfänger*in", "zahlungsempfängerin", "zahlungsempfänger"),
    "amount": ("betrag (€)", "betrag", "betrag(€)"),
    "category": ("kategorie",),
}
_ASSET_GROUP_HEADERS = {
    "girokonto": "Girokonto",
    "tagesgeld konto": "Tagesgeld Konto",
    "tagesgeldkonto": "Tagesgeld Konto",
    "festgeld konto": "Festgeld Konto",
    "festgeldkonto": "Festgeld Konto",
    "wertpapiere": "Wertpapiere",
    "einzelaktien": "Einzelaktien",
}
_ASSET_HEADER_MARKERS = {"iban", "kategorie", "wkn", "institut"}
_BANK_ASSET_GROUPS = {"Girokonto", "Tagesgeld Konto", "Festgeld Konto"}
_IBAN_RE = re.compile(r"^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$", re.IGNORECASE)
_OWNER_PREFIX_RE = re.compile(r"^(Rouven|Lena)\s+", re.IGNORECASE)
_INSTITUTE_ALIASES = (
    ("trade republic", "Trade Republic"),
    ("trade repuplik", "Trade Republic"),
    ("scalable", "Scalable Capital"),
    ("union", "Union Investment"),
    ("fnz", "FNZ Bank"),
    ("comdirect", "Comdirect"),
    ("noris", "Norisbank"),
    ("consors", "Consorsbank"),
    ("consor", "Consorsbank"),
    ("raisin", "Raisin"),
    ("dkb", "DKB"),
)


def _infer_owner(name: str) -> str:
    lowered = name.casefold()
    if "gemeinschaft" in lowered or "gemeinsam" in lowered:
        return "Gemeinsam"
    match = _OWNER_PREFIX_RE.match(name.strip())
    if match:
        return "Rouven" if match.group(1).casefold() == "rouven" else "Lena"
    has_lena = "lena" in lowered
    has_rouven = "rouven" in lowered
    if has_lena and not has_rouven:
        return "Lena"
    if has_rouven and not has_lena:
        return "Rouven"
    return ""


def _display_asset_name(name: str) -> str:
    stripped = _OWNER_PREFIX_RE.sub("", name.strip(), count=1).strip()
    return stripped or name.strip()


def _infer_institute(name: str, explicit: str = "") -> str:
    if explicit.strip():
        value = explicit.strip()
        lowered = value.casefold()
        if "scalable" in lowered:
            return "Scalable Capital"
        if "union" in lowered:
            return "Union Investment"
        if "fnz" in lowered:
            return "FNZ Bank"
        if "trade" in lowered:
            return "Trade Republic"
        return value
    lowered = name.casefold()
    for needle, label in _INSTITUTE_ALIASES:
        if needle in lowered:
            return label
    return ""


def _parse_as_of(value) -> str:
    if value is None or value == "":
        return ""
    if hasattr(value, "strftime"):
        return value.strftime("%Y-%m-%d")
    text = str(value).strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}", text):
        return text[:10]
    match = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$", text)
    if match:
        day, month, year = match.groups()
        if len(year) == 2:
            year = f"20{year}"
        return f"{year}-{int(month):02d}-{int(day):02d}"
    return text


def _parse_rate(value) -> float:
    if value is None or value == "":
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace("%", "").replace("€", "").replace(" ", "").replace("\xa0", "")
    if not text:
        return 0.0
    text = text.replace(".", "").replace(",", ".") if re.search(r",\d{1,2}$", text) else text
    try:
        return float(text)
    except ValueError:
        return 0.0


def load_parser_config(config_path: Path) -> dict:
    with config_path.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def parse_amount(value) -> int:
    if value is None or value == "":
        return 0
    if isinstance(value, (int, float)):
        return int(round(float(value) * 100))
    text = str(value).strip().replace("€", "").replace(" ", "").replace("\xa0", "")
    # Platzhalter wie "- €" / "-   €" in älteren Jahresübersichten
    if not text or text in {"-", "–", "—"} or re.fullmatch(r"-+", text):
        return 0
    text = text.replace(".", "").replace(",", ".") if re.search(r",\d{1,2}$", text) else text
    try:
        return int(round(float(text) * 100))
    except ValueError:
        return 0


def _cell(row: list, index: int):
    if index < len(row):
        return row[index]
    return None


def _should_skip_row(category: str, config: dict) -> bool:
    if not category or not str(category).strip():
        return True
    label = str(category).strip()
    if label in config.get("skip_row_labels", []):
        return True
    if label in config.get("exclude_categories", []):
        return True
    return False


def _resolve_budget_cents(
    row: list,
    config: dict,
    month_indices: dict[str, int],
    category_name: str,
) -> int:
    budget_col = config.get("budget_column", 15)
    budget_cents = parse_amount(_cell(row, budget_col))
    if budget_cents > 0:
        return budget_cents

    fallback_col = config.get("fallback_budget_column")
    if fallback_col is not None:
        budget_cents = parse_amount(_cell(row, fallback_col))
        if budget_cents > 0:
            return budget_cents

    prefixes = config.get("investment_budget_prefixes", [])
    if prefixes and any(category_name.startswith(prefix) for prefix in prefixes):
        values = [parse_amount(_cell(row, col_idx)) for col_idx in month_indices.values()]
        values = [value for value in values if value > 0]
        if values:
            return int(round(sum(values) / len(values)))

    return 0


def parse_monthly_tab(
    tab_name: str,
    rows: list[list],
    config: dict,
    sort_base: int,
) -> list[ParsedBudgetRow]:
    year_month = parse_year_month(tab_name, config.get("month_tab_pattern", r"^\d{4}-\d{2}$"))
    if not year_month:
        return []

    cols = config["columns"]
    start = config.get("data_start_row", 1)
    results: list[ParsedBudgetRow] = []

    for idx, row in enumerate(rows[start:], start=start):
        category = _cell(row, cols["category"])
        if _should_skip_row(str(category or ""), config):
            continue
        budget_cents = parse_amount(_cell(row, cols["budget"]))
        spent_cents = parse_amount(_cell(row, cols["spent"]))
        if budget_cents == 0 and spent_cents == 0:
            continue
        results.append(
            ParsedBudgetRow(
                year_month=year_month,
                category=str(category).strip(),
                budget_cents=budget_cents,
                spent_cents=spent_cents,
                sort_order=sort_base + idx,
            )
        )
    return results


def parse_flat_table(rows: list[list], config: dict) -> list[ParsedBudgetRow]:
    if not rows:
        return []
    header = [str(c).strip().lower() for c in rows[0]]

    def col(name: str) -> int | None:
        aliases = {
            "month": ["monat", "month", "zeitraum"],
            "category": ["kategorie", "category", "posten"],
            "budget": ["budget", "plan", "soll"],
            "spent": ["ist", "spent", "ausgaben", "ausgegeben"],
        }
        for i, h in enumerate(header):
            if h in aliases.get(name, [name]):
                return i
        return None

    month_col = col("month")
    category_col = col("category")
    budget_col = col("budget")
    spent_col = col("spent")
    if None in (month_col, category_col, budget_col, spent_col):
        raise ValueError("Flat table header missing required columns")

    results: list[ParsedBudgetRow] = []
    for idx, row in enumerate(rows[1:], start=1):
        category = _cell(row, category_col)
        if _should_skip_row(str(category or ""), config):
            continue
        month_raw = str(_cell(row, month_col) or "").strip()
        year_month = parse_year_month(month_raw, config.get("month_tab_pattern", r"^\d{4}-\d{2}$"))
        if not year_month:
            continue
        results.append(
            ParsedBudgetRow(
                year_month=year_month,
                category=str(category).strip(),
                budget_cents=parse_amount(_cell(row, budget_col)),
                spent_cents=parse_amount(_cell(row, spent_col)),
                sort_order=idx,
            )
        )
    return results


def parse_overview_matrix(
    tab_name: str,
    rows: list[list],
    config: dict,
    sort_base: int,
) -> list[ParsedBudgetRow]:
    if not re.match(config.get("overview_tab_pattern", r"^\d{4}$"), tab_name):
        return []
    if len(rows) <= config.get("header_row", 1):
        return []

    header = rows[config["header_row"]]
    # Tab-Name YYYY hat Vorrang — in kopierten Sheets steht in der Header-Zelle
    # oft noch das falsche Jahr (z. B. 2026 in Tabs 2024/2025).
    if re.fullmatch(r"\d{4}", tab_name):
        year = tab_name
    else:
        year_raw = _cell(header, config.get("year_column", 0))
        try:
            year = str(int(float(year_raw)))
        except (TypeError, ValueError):
            return []

    month_map = config.get("month_columns") or {
        "Jan": 1,
        "Feb": 2,
        "Mrz": 3,
        "Apr": 4,
        "Mai": 5,
        "Jun": 6,
        "Jul": 7,
        "Aug": 8,
        "Sep": 9,
        "Okt": 10,
        "Nov": 11,
        "Dec": 12,
    }

    month_indices: dict[str, int] = {}
    for month_name, col_idx in month_map.items():
        if isinstance(col_idx, int):
            month_indices[month_name] = col_idx
        elif col_idx < len(header) and str(header[col_idx]).strip() == month_name:
            month_indices[month_name] = col_idx
        else:
            for i, cell in enumerate(header):
                if str(cell).strip() == month_name:
                    month_indices[month_name] = i
                    break

    category_col = config.get("category_column", 0)
    start = config.get("data_start_row", 2)
    results: list[ParsedBudgetRow] = []

    for idx, row in enumerate(rows[start:], start=start):
        category = _cell(row, category_col)
        if _should_skip_row(str(category or ""), config):
            continue
        category_name = str(category).strip()
        budget_cents = _resolve_budget_cents(row, config, month_indices, category_name)

        for month_name, col_idx in month_indices.items():
            spent_cents = parse_amount(_cell(row, col_idx))
            if budget_cents == 0 and spent_cents == 0:
                continue
            month_num = {
                "Jan": "01",
                "Feb": "02",
                "Mrz": "03",
                "Apr": "04",
                "Mai": "05",
                "Jun": "06",
                "Jul": "07",
                "Aug": "08",
                "Sep": "09",
                "Okt": "10",
                "Nov": "11",
                "Dec": "12",
            }[month_name]
            results.append(
                ParsedBudgetRow(
                    year_month=f"{year}-{month_num}",
                    category=category_name,
                    budget_cents=budget_cents,
                    spent_cents=spent_cents,
                    sort_order=sort_base + idx,
                )
            )
    return results


def parse_spreadsheet(all_tabs: dict[str, list[list]], config_path: Path) -> list[ParsedBudgetRow]:
    config = load_parser_config(config_path)
    mode = config.get("mode", "monthly_tabs")
    skip_tabs = set(config.get("skip_tabs", []))
    parsed: list[ParsedBudgetRow] = []

    if mode == "flat_table":
        for tab_name, rows in all_tabs.items():
            if tab_name in skip_tabs:
                continue
            parsed.extend(parse_flat_table(rows, config))
        return parsed

    sort_base = 0
    for tab_name, rows in all_tabs.items():
        if tab_name in skip_tabs:
            continue
        if mode == "overview_matrix":
            parsed.extend(parse_overview_matrix(tab_name, rows, config, sort_base))
            sort_base += 1000
        elif mode == "monthly_tabs":
            parsed.extend(parse_monthly_tab(tab_name, rows, config, sort_base))
            sort_base += 1000
    return parsed


def parse_assets(all_tabs: dict[str, list[list]], config_path: Path) -> list[ParsedAsset]:
    """Liest die Kurzüberblick-Tabelle Vermögen / Wert aus dem Vermögensübersicht-Tab."""
    config = load_parser_config(config_path)
    tab_name = config.get("assets_tab", "Vermögensübersicht")
    rows = all_tabs.get(tab_name)
    if not rows:
        return []

    name_col = int(config.get("assets_name_column", 1))
    value_col = int(config.get("assets_value_column", 2))

    header_idx = None
    for i, row in enumerate(rows):
        name = str(_cell(row, name_col) or "").strip().lower()
        value = str(_cell(row, value_col) or "").strip().lower()
        if name == "vermögen" and value.startswith("wert"):
            header_idx = i
            break
    if header_idx is None:
        return []

    assets: list[ParsedAsset] = []
    for idx, row in enumerate(rows[header_idx + 1 :], start=1):
        if any(str(c).strip().upper() == "IBAN" for c in row):
            break
        name = str(_cell(row, name_col) or "").strip()
        if not name:
            break
        value_cents = parse_amount(_cell(row, value_col))
        assets.append(ParsedAsset(name=name, value_cents=value_cents, sort_order=idx))

    return assets


def parse_asset_accounts(
    all_tabs: dict[str, list[list]],
    config_path: Path,
) -> list[ParsedAssetAccount]:
    """Liest Kontodetails (Name, IBAN/WKN, Vermögenswert) aus dem Vermögensübersicht-Tab."""
    config = load_parser_config(config_path)
    tab_name = config.get("assets_tab", "Vermögensübersicht")
    rows = all_tabs.get(tab_name)
    if not rows:
        return []

    name_col = int(config.get("assets_name_column", 1))
    iban_col = int(config.get("assets_iban_column", 2))
    value_col = int(config.get("assets_detail_value_column", 4))
    wkn_col = int(config.get("assets_wkn_column", 5))

    start_idx = None
    for i, row in enumerate(rows):
        if any(str(cell).strip().upper() == "IBAN" for cell in row):
            start_idx = i
            break
    if start_idx is None:
        return []

    accounts: list[ParsedAssetAccount] = []
    current_group: str | None = None
    sort_order = 0

    for row in rows[start_idx:]:
        name = str(_cell(row, name_col) or "").strip()
        if not name:
            continue

        group_key = name.casefold()
        if group_key in _ASSET_GROUP_HEADERS:
            current_group = _ASSET_GROUP_HEADERS[group_key]
            marker = str(_cell(row, iban_col) or "").strip().casefold()
            if not marker or marker in _ASSET_HEADER_MARKERS:
                continue

        if current_group is None:
            continue

        if current_group in _BANK_ASSET_GROUPS:
            identifier = str(_cell(row, iban_col) or "").strip().replace(" ", "")
            if identifier and not _IBAN_RE.match(identifier):
                continue
            institute = _infer_institute(name)
            category = current_group.replace(" Konto", "")
            as_of = _parse_as_of(_cell(row, 5))
            rate_kind = "interest"
            rate_value = _parse_rate(_cell(row, 6))
        else:
            identifier = str(_cell(row, wkn_col) or "").strip()
            institute = _infer_institute(name, str(_cell(row, 3) or ""))
            category = str(_cell(row, 2) or "").strip()
            as_of = _parse_as_of(_cell(row, 6))
            rate_kind = "contribution"
            rate_value = _parse_rate(_cell(row, 7))

        sort_order += 1
        owner = _infer_owner(name)
        accounts.append(
            ParsedAssetAccount(
                group=current_group,
                name=_display_asset_name(name),
                iban=identifier,
                value_cents=parse_amount(_cell(row, value_col)),
                sort_order=sort_order,
                institute=institute,
                category=category,
                owner=owner,
                as_of=as_of,
                rate_kind=rate_kind,
                rate_value=rate_value,
            )
        )

    return accounts


def _tx_year_month(tab_name: str) -> str | None:
    match = _TX_TAB_RE.match(tab_name)
    if not match:
        return None
    year, month = match.group(1), int(match.group(2))
    if month < 1 or month > 12:
        return None
    return f"{year}-{month:02d}"


def _find_tx_columns(header: list) -> dict[str, int] | None:
    lowered = {i: str(cell or "").strip().casefold() for i, cell in enumerate(header)}
    columns: dict[str, int] = {}
    for key, aliases in _TX_HEADER_ALIASES.items():
        for idx, label in lowered.items():
            if label in aliases:
                columns[key] = idx
                break
    required = {"booking_date", "payee", "amount", "category"}
    if not required.issubset(columns):
        return None
    return columns


def parse_transaction_tab(
    tab_name: str,
    rows: list[list],
    sort_base: int,
) -> list[ParsedTransaction]:
    year_month = _tx_year_month(tab_name)
    if not year_month or not rows:
        return []

    header_idx = None
    columns = None
    for i, row in enumerate(rows[:5]):
        found = _find_tx_columns(row)
        if found:
            header_idx = i
            columns = found
            break
    if header_idx is None or columns is None:
        return []

    results: list[ParsedTransaction] = []
    for offset, row in enumerate(rows[header_idx + 1 :], start=1):
        category = str(_cell(row, columns["category"]) or "").strip()
        if not category:
            continue
        booking_date = _parse_as_of(_cell(row, columns["booking_date"]))
        if not booking_date:
            continue
        payee = str(_cell(row, columns["payee"]) or "").strip()
        amount_cents = parse_amount(_cell(row, columns["amount"]))
        if amount_cents == 0:
            continue
        results.append(
            ParsedTransaction(
                year_month=year_month,
                category=category,
                booking_date=booking_date,
                payee=payee,
                amount_cents=amount_cents,
                source_tab=tab_name,
                sort_order=sort_base + offset,
            )
        )
    return results


def parse_transactions(
    all_tabs: dict[str, list[list]],
    config_path: Path,
) -> list[ParsedTransaction]:
    config = load_parser_config(config_path)
    pattern = config.get("transaction_tab_pattern", r"^\d{4}_\d{1,2}(?:_[RL])?$")
    skip_tabs = set(config.get("skip_tabs", []))
    parsed: list[ParsedTransaction] = []
    sort_base = 0
    for tab_name, rows in sorted(all_tabs.items()):
        if tab_name in skip_tabs:
            continue
        if not re.match(pattern, tab_name):
            continue
        batch = parse_transaction_tab(tab_name, rows, sort_base)
        parsed.extend(batch)
        sort_base += 10_000
    return parsed
