export interface CategoryRow {
  category_id: number;
  category_name: string;
  budget: number;
  spent: number;
  remaining: number;
  usage_percent: number | null;
}

export interface Overview {
  month: string;
  totals: {
    budget: number;
    spent: number;
    remaining: number;
    usage_percent: number | null;
  };
  categories: CategoryRow[];
}

export interface SyncStatus {
  status: string;
  started_at?: string;
  finished_at?: string;
  rows_processed?: number;
  error_message?: string | null;
}

const API = "/api";

export async function fetchMonths(): Promise<string[]> {
  const res = await fetch(`${API}/months`);
  if (!res.ok) throw new Error("Monate konnten nicht geladen werden");
  const data = await res.json();
  return data.months;
}

export async function fetchOverview(month: string): Promise<Overview> {
  const res = await fetch(`${API}/overview?month=${encodeURIComponent(month)}`);
  if (!res.ok) throw new Error("Übersicht konnte nicht geladen werden");
  return res.json();
}

export async function fetchSyncStatus(): Promise<SyncStatus> {
  const res = await fetch(`${API}/sync/status`);
  if (!res.ok) throw new Error("Sync-Status nicht verfügbar");
  return res.json();
}

export async function triggerSync(): Promise<void> {
  const res = await fetch(`${API}/sync/trigger`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Sync fehlgeschlagen");
  }
}

export function formatEuro(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function formatMonthLabel(yearMonth: string): string {
  if (/^\d{4}$/.test(yearMonth)) {
    return `Jahr ${yearMonth}`;
  }
  const [year, month] = yearMonth.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

export function isYearPeriod(period: string): boolean {
  return /^\d{4}$/.test(period);
}

export function monthPeriodsOnly(months: string[]): string[] {
  return months.filter((m) => !isYearPeriod(m));
}

export function currentYearMonth(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

/** Bevorzugt den laufenden Kalendermonat, sonst den neuesten verfügbaren Monat bis heute. */
export function pickDefaultMonth(months: string[]): string | undefined {
  const monthOnly = monthPeriodsOnly(months);
  if (monthOnly.length === 0) return undefined;

  const current = currentYearMonth();
  if (monthOnly.includes(current)) return current;

  const notFuture = monthOnly.filter((m) => m <= current);
  if (notFuture.length > 0) {
    return notFuture.sort((a, b) => b.localeCompare(a))[0];
  }

  return monthOnly[0];
}

export function usageClass(percent: number | null): string {
  if (percent === null) return "neutral";
  if (percent > 100) return "over";
  if (percent >= 80) return "warn";
  return "ok";
}

const INVESTMENT_NAMES = new Set(["Geldanlage Rouven", "Geldanlage Lena"]);

export function splitCategories(categories: CategoryRow[]) {
  const expenses: CategoryRow[] = [];
  const investments: CategoryRow[] = [];
  for (const row of categories) {
    if (INVESTMENT_NAMES.has(row.category_name)) {
      investments.push(row);
    } else {
      expenses.push(row);
    }
  }
  return { expenses, investments };
}

export function sumCategories(rows: CategoryRow[]) {
  const budget = rows.reduce((s, r) => s + r.budget, 0);
  const spent = rows.reduce((s, r) => s + r.spent, 0);
  return {
    budget,
    spent,
    remaining: budget - spent,
    usage_percent: budget > 0 ? Math.round((spent / budget) * 1000) / 10 : null,
  };
}
