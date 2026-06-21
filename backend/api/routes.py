from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from backend.db.repository import Repository

router = APIRouter(prefix="/api")


def _format_cents(cents: int) -> float:
    return round(cents / 100, 2)


@router.get("/months")
def list_months(request: Request):
    repo: Repository = request.app.state.repo
    return {"months": repo.list_months()}


@router.get("/overview")
def get_overview(month: str, request: Request):
    repo: Repository = request.app.state.repo
    rows = repo.get_overview(month)
    if not rows:
        raise HTTPException(status_code=404, detail=f"No data for month {month}")

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
