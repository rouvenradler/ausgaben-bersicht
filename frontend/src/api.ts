export type Trend = "up" | "down" | "flat";

export interface CategoryRow {
  category_id: number;
  category_name: string;
  budget: number;
  spent: number;
  remaining: number;
  usage_percent: number | null;
  trend?: Trend | null;
}

export interface Overview {
  month: string;
  /** Summe der Excel-Zeile „Einnahmen“ für den gewählten Zeitraum. */
  income?: number;
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

export interface CategoryMonthPoint {
  year_month: string;
  budget: number;
  spent: number;
}

export interface CategoryMonthlySeries {
  category_id: number;
  category_name: string;
  year: string;
  months: CategoryMonthPoint[];
}

export async function fetchCategoryMonthly(
  categoryId: number,
  year: string,
): Promise<CategoryMonthlySeries> {
  const res = await fetch(
    `${API}/categories/${categoryId}/monthly?year=${encodeURIComponent(year)}`,
  );
  if (!res.ok) throw new Error("Monatsverlauf konnte nicht geladen werden");
  return res.json();
}

export interface TotalsMonthPoint {
  year_month: string;
  spent: number;
  income: number;
}

export interface TotalsMonthlySeries {
  year: string;
  months: TotalsMonthPoint[];
}

export async function fetchTotalsMonthly(year: string): Promise<TotalsMonthlySeries> {
  const res = await fetch(
    `${API}/totals/monthly?year=${encodeURIComponent(year)}`,
  );
  if (!res.ok) throw new Error("Monatsverlauf konnte nicht geladen werden");
  return res.json();
}

export interface CategoryTransaction {
  date: string;
  payee: string;
  amount: number;
  year_month: string;
}

export interface CategoryTransactions {
  category_id: number;
  category_name: string;
  period: string;
  count: number;
  total: number;
  items: CategoryTransaction[];
}

export async function fetchCategoryTransactions(
  categoryId: number,
  period: string,
): Promise<CategoryTransactions> {
  const res = await fetch(
    `${API}/categories/${categoryId}/transactions?period=${encodeURIComponent(period)}`,
  );
  if (!res.ok) throw new Error("Buchungen konnten nicht geladen werden");
  return res.json();
}

export async function fetchSyncStatus(): Promise<SyncStatus> {
  const res = await fetch(`${API}/sync/status`);
  if (!res.ok) throw new Error("Sync-Status nicht verfügbar");
  return res.json();
}

export interface AssetItem {
  name: string;
  value: number;
}

export interface AssetAccount {
  group: string;
  name: string;
  iban: string;
  value: number;
  institute?: string;
  category?: string;
  owner?: string;
  as_of?: string;
  rate_kind?: string;
  rate_value?: number;
}

export interface AssetsOverview {
  items: AssetItem[];
  total: number;
  accounts: AssetAccount[];
}

export async function fetchAssets(): Promise<AssetsOverview> {
  const res = await fetch(`${API}/assets`);
  if (!res.ok) throw new Error("Vermögen konnte nicht geladen werden");
  const data = await res.json();
  return {
    items: data.items ?? [],
    total: data.total ?? 0,
    accounts: data.accounts ?? [],
  };
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

export type PeriodScope = "assets" | "month" | "year";

export function isYearPeriod(period: string): boolean {
  return /^\d{4}$/.test(period);
}

export function monthPeriodsOnly(months: string[]): string[] {
  return months.filter((m) => !isYearPeriod(m));
}

export function yearPeriodsOnly(periods: string[]): string[] {
  return periods.filter(isYearPeriod).sort((a, b) => b.localeCompare(a));
}

/** Periodenliste für den aktiven Scope (Monate bzw. Jahre). */
export function periodsForScope(periods: string[], scope: PeriodScope): string[] {
  if (scope === "assets") return [];
  return scope === "year" ? yearPeriodsOnly(periods) : monthPeriodsOnly(periods);
}

/**
 * Wählt beim Scope-Wechsel einen sinnvollen Zeitraum:
 * Jahr ← Monat: Jahr des aktuellen Monats; Monat ← Jahr: laufender Monat in dem Jahr, sonst neuester Monat.
 */
export function pickPeriodForScope(
  periods: string[],
  scope: PeriodScope,
  current?: string,
): string | undefined {
  if (scope === "assets") return undefined;
  const list = periodsForScope(periods, scope);
  if (list.length === 0) return undefined;

  if (scope === "year") {
    if (current && isYearPeriod(current) && list.includes(current)) return current;
    if (current && !isYearPeriod(current)) {
      const year = current.slice(0, 4);
      if (list.includes(year)) return year;
    }
    return pickDefaultYear(list);
  }

  if (current && !isYearPeriod(current) && list.includes(current)) return current;
  if (current && isYearPeriod(current)) {
    const inYear = list.filter((m) => m.startsWith(`${current}-`));
    if (inYear.length > 0) {
      const preferred = `${current}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
      if (inYear.includes(preferred)) return preferred;
      return inYear.sort((a, b) => b.localeCompare(a))[0];
    }
  }
  return pickDefaultMonth(list);
}

export function pickDefaultYear(years: string[]): string | undefined {
  if (years.length === 0) return undefined;
  const currentYear = String(new Date().getFullYear());
  if (years.includes(currentYear)) return currentYear;
  return [...years].sort((a, b) => b.localeCompare(a))[0];
}

export function currentYearMonth(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

/**
 * Standard-Zeitraum: bevorzugt das laufende Jahr, sonst das neueste Jahr.
 * Nur wenn gar keine Jahres-Zeiträume vorhanden sind, wird auf einen Monat
 * zurückgefallen.
 */
export function pickDefaultPeriod(periods: string[]): string | undefined {
  return pickDefaultYear(yearPeriodsOnly(periods)) ?? pickDefaultMonth(periods);
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

export interface Forecast {
  /** Hochgerechneter Ausgabenwert am Ende des Zeitraums. */
  value: number;
  /** Prognose − Budget (positiv = über Budget). */
  deltaVsBudget: number;
  /** Abweichung zum Budget in Prozent, null wenn kein Budget. */
  deltaPercent: number | null;
  over: boolean;
  scope: "year" | "month";
}

/** Start (inkl.) und Ende (exkl.) eines Jahres- oder Monats-Zeitraums. */
export function periodBounds(period: string): { start: Date; end: Date } {
  if (isYearPeriod(period)) {
    const year = Number(period);
    return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1) };
  }
  const [y, m] = period.split("-").map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}

/** Anteil des bereits verstrichenen Zeitraums (0..1). */
export function elapsedFraction(period: string, now: Date = new Date()): number {
  const { start, end } = periodBounds(period);
  const total = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  return Math.min(Math.max(elapsed / total, 0), 1);
}

/**
 * Rechnet die bisherigen Ausgaben linear auf das Ende des Zeitraums hoch
 * (Run-Rate). Bei einem Jahres-Zeitraum ergibt das die Jahresendprognose,
 * bei einem Monat die Monatsendprognose.
 */
export function computeForecast(
  period: string,
  spent: number,
  budget: number,
  now: Date = new Date(),
): Forecast {
  const scope: "year" | "month" = isYearPeriod(period) ? "year" : "month";
  const fraction = elapsedFraction(period, now);

  let value: number;
  if (fraction <= 0) {
    value = budget; // Zeitraum noch nicht begonnen → Budget als Erwartung
  } else if (fraction >= 1) {
    value = spent; // Zeitraum abgeschlossen → tatsächliche Ausgaben
  } else {
    value = spent / fraction; // lineare Hochrechnung
  }

  const deltaVsBudget = value - budget;
  const deltaPercent =
    budget > 0 ? Math.round((deltaVsBudget / budget) * 1000) / 10 : null;

  return { value, deltaVsBudget, deltaPercent, over: deltaVsBudget > 0, scope };
}

const INVESTMENT_NAMES = new Set(["Geldanlage Rouven", "Geldanlage Lena"]);
const INCOME_NAMES = new Set(["Einnahmen"]);

export function splitCategories(categories: CategoryRow[]) {
  const expenses: CategoryRow[] = [];
  const investments: CategoryRow[] = [];
  for (const row of categories) {
    if (INCOME_NAMES.has(row.category_name)) {
      continue;
    }
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
