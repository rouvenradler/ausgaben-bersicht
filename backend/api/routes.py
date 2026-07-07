from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, Request

from backend.db.repository import Repository

router = APIRouter(prefix="/api")

# Kategorien mit einer Ausgabenänderung unterhalb dieser Schwelle (relativ zum
# größeren der beiden Monatswerte) gelten als "gleichbleibend".
_TREND_THRESHOLD = 0.05


def _format_cents(cents: int) -> float:
    return round(cents / 100, 2)


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

    categories = []
    total_budget = 0
    total_spent = 0
    for row in rows:
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
        "totals": {
            "budget": _format_cents(total_budget),
            "spent": _format_cents(total_spent),
            "remaining": _format_cents(total_budget - total_spent),
            "usage_percent": round(total_spent / total_budget * 100, 1) if total_budget else None,
        },
        "categories": categories,
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
