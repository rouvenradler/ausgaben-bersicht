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


def load_parser_config(config_path: Path) -> dict:
    with config_path.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def parse_amount(value) -> int:
    if value is None or value == "":
        return 0
    if isinstance(value, (int, float)):
        return int(round(float(value) * 100))
    text = str(value).strip().replace("€", "").replace(" ", "")
    if not text:
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

    budget_col = config.get("budget_column", 15)
    category_col = config.get("category_column", 0)
    start = config.get("data_start_row", 2)
    results: list[ParsedBudgetRow] = []

    for idx, row in enumerate(rows[start:], start=start):
        category = _cell(row, category_col)
        if _should_skip_row(str(category or ""), config):
            continue
        category_name = str(category).strip()
        budget_cents = parse_amount(_cell(row, budget_col))

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
