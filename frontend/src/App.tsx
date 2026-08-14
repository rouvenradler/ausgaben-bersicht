import { useCallback, useEffect, useMemo, useState } from "react";
import {
  elapsedFraction,
  fetchCategoryMonthly,
  fetchMonths,
  fetchOverview,
  fetchSyncStatus,
  formatEuro,
  formatMonthLabel,
  isYearPeriod,
  monthPeriodsOnly,
  periodsForScope,
  pickDefaultPeriod,
  pickPeriodForScope,
  yearPeriodsOnly,
  splitCategories,
  sumCategories,
  triggerSync,
  type CategoryMonthlySeries,
  type CategoryRow,
  type Overview,
  type PeriodScope,
  type SyncStatus,
} from "./api";
import {
  CategoryMonthlyChart,
  CategoryTable,
  KpiCard,
  MonthSelector,
  ScopeToggle,
} from "./components";

export default function App() {
  const [periods, setPeriods] = useState<string[]>([]);
  const [period, setPeriod] = useState<string>("");
  const [scope, setScope] = useState<PeriodScope>("year");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedColor, setSelectedColor] = useState("#3b82f6");
  const [monthlySeries, setMonthlySeries] = useState<CategoryMonthlySeries | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

  const scopedPeriods = useMemo(
    () => periodsForScope(periods, scope),
    [periods, scope],
  );
  const hasMonths = useMemo(() => monthPeriodsOnly(periods).length > 0, [periods]);
  const hasYears = useMemo(() => yearPeriodsOnly(periods).length > 0, [periods]);

  const chartYear = period ? (isYearPeriod(period) ? period : period.slice(0, 4)) : "";
  const highlightMonth = period && !isYearPeriod(period) ? period : null;

  const loadCategoryChart = useCallback(async (categoryId: number, year: string) => {
    if (!year) return;
    setChartLoading(true);
    setChartError(null);
    try {
      const series = await fetchCategoryMonthly(categoryId, year);
      setMonthlySeries(series);
    } catch (e) {
      setMonthlySeries(null);
      setChartError(e instanceof Error ? e.message : "Monatsverlauf nicht verfügbar");
    } finally {
      setChartLoading(false);
    }
  }, []);

  const loadData = useCallback(async (selectedPeriod?: string, preferredScope?: PeriodScope) => {
    setLoading(true);
    setError(null);
    try {
      const [periodList, status] = await Promise.all([fetchMonths(), fetchSyncStatus()]);
      setSyncStatus(status);
      setPeriods(periodList);

      const nextScope =
        preferredScope ??
        (selectedPeriod
          ? isYearPeriod(selectedPeriod)
            ? "year"
            : "month"
          : "year");
      setScope(nextScope);

      const active =
        selectedPeriod && periodList.includes(selectedPeriod)
          ? selectedPeriod
          : pickPeriodForScope(periodList, nextScope) ?? pickDefaultPeriod(periodList);

      if (!active) {
        setOverview(null);
        setPeriod("");
        return;
      }
      setPeriod(active);
      const data = await fetchOverview(active);
      setOverview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedCategoryId != null && chartYear) {
      void loadCategoryChart(selectedCategoryId, chartYear);
    }
  }, [selectedCategoryId, chartYear, loadCategoryChart]);

  const onPeriodChange = async (next: string) => {
    setPeriod(next);
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOverview(next);
      setOverview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  };

  const onScopeChange = async (nextScope: PeriodScope) => {
    if (nextScope === scope) return;
    const next = pickPeriodForScope(periods, nextScope, period);
    if (!next) return;
    setScope(nextScope);
    await onPeriodChange(next);
  };

  const onSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await triggerSync();
      await loadData(period, scope);
      if (selectedCategoryId != null && chartYear) {
        await loadCategoryChart(selectedCategoryId, chartYear);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync fehlgeschlagen");
    } finally {
      setSyncing(false);
    }
  };

  const onSelectCategory = (row: CategoryRow, color: string) => {
    if (selectedCategoryId === row.category_id) {
      setSelectedCategoryId(null);
      setMonthlySeries(null);
      setChartError(null);
      return;
    }
    setSelectedCategoryId(row.category_id);
    setSelectedColor(color);
  };

  const onCloseChart = () => {
    setSelectedCategoryId(null);
    setMonthlySeries(null);
    setChartError(null);
  };

  const { expenses, investments } = overview
    ? splitCategories(overview.categories)
    : { expenses: [], investments: [] };
  const expenseTotals = sumCategories(expenses);
  const fraction = period ? elapsedFraction(period) : 1;
  const income = overview?.income ?? 0;

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Kontomanager</h1>
          <p className="subtitle">
            {period ? formatMonthLabel(period) : "Finanzübersicht"}
          </p>
        </div>
        <div className="header-actions">
          {(hasMonths || hasYears) && (
            <ScopeToggle
              scope={scope}
              onChange={onScopeChange}
              hasMonths={hasMonths}
              hasYears={hasYears}
            />
          )}
          {scopedPeriods.length > 0 && period && (
            <MonthSelector
              months={scopedPeriods}
              current={period}
              onChange={onPeriodChange}
            />
          )}
          <button type="button" className="sync-btn" onClick={onSync} disabled={syncing}>
            {syncing ? "Sync …" : "Jetzt syncen"}
          </button>
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}
      {syncStatus?.status === "error" && (
        <div className="banner warn">
          Letzter Sync fehlgeschlagen: {syncStatus.error_message}
        </div>
      )}

      {loading && !overview ? (
        <div className="loading">Lade Daten …</div>
      ) : overview ? (
        <>
          <section className="kpis">
            <KpiCard label="Budget" value={formatEuro(expenseTotals.budget)} />
            <KpiCard label="Ausgegeben" value={formatEuro(expenseTotals.spent)} />
            <KpiCard
              label="Verbleibend"
              value={formatEuro(expenseTotals.remaining)}
              variant={expenseTotals.remaining < 0 ? "over" : "default"}
            />
            <KpiCard
              label="Einnahmen"
              value={formatEuro(income)}
              sub={isYearPeriod(period) ? "Summe im Jahr" : "Summe im Monat"}
              variant="ok"
            />
          </section>

          <section className="panel">
            <h2>Ausgaben nach Kategorie</h2>
            <p className="panel-hint">Kategorie anklicken für Monatsverlauf</p>
            <CategoryTable
              rows={expenses}
              fraction={fraction}
              isYearView={isYearPeriod(period)}
              footerLabel="Summe Ausgaben"
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={onSelectCategory}
            />
          </section>

          {investments.length > 0 && (
            <section className="panel panel-secondary">
              <h2>Geldanlagen</h2>
              <CategoryTable
                rows={investments}
                fraction={fraction}
                isYearView={isYearPeriod(period)}
                footerLabel="Summe Geldanlagen"
                selectedCategoryId={selectedCategoryId}
                onSelectCategory={onSelectCategory}
              />
            </section>
          )}

          {selectedCategoryId != null && (monthlySeries || chartLoading || chartError) && (
            <CategoryMonthlyChart
              series={
                monthlySeries ?? {
                  category_id: selectedCategoryId,
                  category_name: "…",
                  year: chartYear,
                  months: Array.from({ length: 12 }, (_, i) => ({
                    year_month: `${chartYear}-${String(i + 1).padStart(2, "0")}`,
                    budget: 0,
                    spent: 0,
                  })),
                }
              }
              color={selectedColor}
              highlightMonth={highlightMonth}
              loading={chartLoading && !monthlySeries}
              error={chartError}
              onClose={onCloseChart}
            />
          )}
        </>
      ) : (
        <div className="empty">
          <p>Noch keine Daten vorhanden.</p>
          <button type="button" className="sync-btn" onClick={onSync} disabled={syncing}>
            Ersten Sync starten
          </button>
        </div>
      )}

      <footer className="footer">
        {syncStatus?.finished_at ? (
          <span>
            Datenstand:{" "}
            {new Date(syncStatus.finished_at).toLocaleString("de-DE")}
            {syncStatus.rows_processed != null && ` · ${syncStatus.rows_processed} Zeilen`}
          </span>
        ) : (
          <span>Noch kein Sync durchgeführt</span>
        )}
      </footer>
    </div>
  );
}
