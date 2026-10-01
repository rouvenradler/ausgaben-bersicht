from __future__ import annotations

from datetime import date
from pathlib import Path

import yaml
from fastapi import APIRouter, HTTPException, Request

from backend.db.repository import Repository

router = APIRouter(prefix="/api")

# Kategorien mit einer Ausgabenänderung unterhalb dieser Schwelle (relativ zum
# größeren der beiden Monatswerte) gelten als "gleichbleibend".
_TREND_THRESHOLD = 0.05
_DEFAULT_INCOME_LABELS = frozenset({"Einnahmen"})
_INVESTMENT_NAMES = frozenset({"Geldanlage Rouven", "Geldanlage Lena"})


def _format_cents(cents: int) -> float:
    return round(cents / 100, 2)


def _income_labels(request: Request) -> frozenset[str]:
    settings = request.app.state.settings
    path = Path(settings.parser_config_path)
    if not path.exists():
        return _DEFAULT_INCOME_LABELS
    try:
        with path.open(encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}
        labels = config.get("income_row_labels") or list(_DEFAULT_INCOME_LABELS)
        return frozenset(str(label) for label in labels)
    except Exception:
        return _DEFAULT_INCOME_LABELS


def _trend_reference_months(repo: Repository, period: str) -> tuple[str | None, str | None]:
    """Ermittelt (Referenzmonat, Vormonat) für den Trend-Vergleich."""
    monthly = sorted(m for m in repo.list_months() if len(m) == 7)
    if len(monthly) < 2:
        return None, None

    if len(period) == 4 and period.isdigit():
        current_ym = date.today().strftime("%Y-%m")
        completed = [m for m in monthly if m.startswith(f"{period}-") and m < current_ym]
        if len(completed) >= 2:
            return completed[-1], completed[-2]
        in_year = [m for m in monthly if m.startswith(f"{period}-")]
        if len(in_year) >= 2:
            return in_year[-1], in_year[-2]
        return None, None

    if period in monthly:
        idx = monthly.index(period)
        if idx > 0:
            return period, monthly[idx - 1]
    return None, None


def _compute_trends(repo: Repository, period: str) -> dict[int, str]:
    ref, prev = _trend_reference_months(repo, period)
    if not ref or not prev:
        return {}
    ref_map = repo.get_month_spent(ref)
    prev_map = repo.get_month_spent(prev)
    trends: dict[int, str] = {}
    for cid, ref_spent in ref_map.items():
        prev_spent = prev_map.get(cid, 0)
        base = max(abs(prev_spent), abs(ref_spent), 1)
        delta = ref_spent - prev_spent
        if delta > _TREND_THRESHOLD * base:
            trends[cid] = "up"
        elif delta < -_TREND_THRESHOLD * base:
            trends[cid] = "down"
        else:
            trends[cid] = "flat"
    return trends


@router.get("/months")
def list_months(request: Request):
    repo: Repository = request.app.state.repo
    return {"months": repo.list_months()}


@router.get("/overview")
def get_overview(month: str, request: Request):
    repo: Repository = request.app.state.repo
    rows = repo.get_overview(month)
    if not rows:
        label = f"Jahr {month}" if month.isdigit() and len(month) == 4 else f"Monat {month}"
        raise HTTPException(status_code=404, detail=f"No data for {label}")

    trends = _compute_trends(repo, month)
    income_labels = _income_labels(request)

    categories = []
    total_budget = 0
    total_spent = 0
    income_cents = 0
    for row in rows:
        if row.category_name in income_labels:
            income_cents += row.spent_cents
            continue
        total_budget += row.budget_cents
        total_spent += row.spent_cents
        categories.append(
            {
                "category_id": row.category_id,
                "category_name": row.category_name,
                "budget": _format_cents(row.budget_cents),
                "spent": _format_cents(row.spent_cents),
                "remaining": _format_cents(row.remaining_cents),
                "usage_percent": row.usage_percent,
                "trend": trends.get(row.category_id),
            }
        )

    return {
        "month": month,
        "income": _format_cents(income_cents),
        "totals": {
            "budget": _format_cents(total_budget),
            "spent": _format_cents(total_spent),
            "remaining": _format_cents(total_budget - total_spent),
            "usage_percent": round(total_spent / total_budget * 100, 1) if total_budget else None,
        },
        "categories": categories,
    }


@router.get("/categories/{category_id}/monthly")
def category_monthly(category_id: int, year: str, request: Request):
    if not (len(year) == 4 and year.isdigit()):
        raise HTTPException(status_code=400, detail="year must be YYYY")
    repo: Repository = request.app.state.repo
    series = repo.get_category_monthly_series(category_id, year)
    if not series:
        raise HTTPException(status_code=404, detail="Category not found")

    return {
        "category_id": series["category_id"],
        "category_name": series["category_name"],
        "year": series["year"],
        "months": [
            {
                "year_month": m["year_month"],
                "budget": _format_cents(m["budget_cents"]),
                "spent": _format_cents(m["spent_cents"]),
            }
            for m in series["months"]
        ],
    }


@router.get("/totals/monthly")
def totals_monthly(year: str, request: Request):
    if not (len(year) == 4 and year.isdigit()):
        raise HTTPException(status_code=400, detail="year must be YYYY")

    repo: Repository = request.app.state.repo
    series = repo.get_totals_monthly_series(
        year,
        income_labels=_income_labels(request),
        investment_names=_INVESTMENT_NAMES,
    )
    return {
        "year": series["year"],
        "months": [
            {
                "year_month": m["year_month"],
                "spent": _format_cents(m["spent_cents"]),
                "income": _format_cents(m["income_cents"]),
            }
            for m in series["months"]
        ],
    }


@router.get("/categories/{category_id}/transactions")
def category_transactions(category_id: int, period: str, request: Request):
    is_year = len(period) == 4 and period.isdigit()
    is_month = len(period) == 7 and period[4] == "-" and period[:4].isdigit() and period[5:].isdigit()
    if not is_year and not is_month:
        raise HTTPException(status_code=400, detail="period must be YYYY or YYYY-MM")

    repo: Repository = request.app.state.repo
    category_name = repo.get_category_name(category_id)
    if not category_name:
        raise HTTPException(status_code=404, detail="Category not found")

    rows = repo.list_category_transactions(category_id, period)
    # Absolutwert der Ausgänge (negative Beträge) zum Abgleich mit Ist (YTD)
    outflow_total = sum(-row["amount_cents"] for row in rows if row["amount_cents"] < 0)
    return {
        "category_id": category_id,
        "category_name": category_name,
        "period": period,
        "count": len(rows),
        "total": _format_cents(outflow_total),
        "items": [
            {
                "date": row["booking_date"],
                "payee": row["payee"],
                "amount": _format_cents(row["amount_cents"]),
                "year_month": row["year_month"],
            }
            for row in rows
        ],
    }


@router.get("/assets")
def list_assets(request: Request):
    repo: Repository = request.app.state.repo
    rows = repo.list_assets()
    items = [
        {
            "name": row["name"],
            "value": _format_cents(row["value_cents"]),
        }
        for row in rows
    ]
    total = sum(row["value_cents"] for row in rows)
    accounts = [
        {
            "group": row["group"],
            "name": row["name"],
            "iban": row["iban"],
            "value": _format_cents(row["value_cents"]),
            "institute": row["institute"],
            "category": row["category"],
            "owner": row["owner"],
            "as_of": row["as_of"],
            "rate_kind": row["rate_kind"],
            "rate_value": row["rate_value"],
        }
        for row in repo.list_asset_accounts()
    ]
    return {
        "items": items,
        "total": _format_cents(total),
        "accounts": accounts,
    }


@router.get("/sync/status")
def sync_status(request: Request):
    repo: Repository = request.app.state.repo
    status = repo.get_latest_sync_status()
    if not status:
        return {"status": "never_run"}
    return status


@router.post("/sync/trigger")
def sync_trigger(request: Request):
    scheduler = request.app.state.scheduler
    try:
        result = scheduler.trigger_now()
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
