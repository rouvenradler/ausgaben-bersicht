import { useCallback, useEffect, useMemo, useState } from "react";
import {
  elapsedFraction,
  fetchAssets,
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
  type AssetsOverview,
  type CategoryMonthlySeries,
  type CategoryRow,
  type Overview,
  type PeriodScope,
  type SyncStatus,
} from "./api";
import {
  AssetsDashboard,
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
  const [assets, setAssets] = useState<AssetsOverview | null>(null);
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

  const loadAssets = useCallback(async () => {
    try {
      const data = await fetchAssets();
      setAssets(data);
      return data;
    } catch {
      setAssets({ items: [], total: 0, accounts: [] });
      return { items: [], total: 0, accounts: [] };
    }
  }, []);

  const loadData = useCallback(async (selectedPeriod?: string, preferredScope?: PeriodScope) => {
    setLoading(true);
    setError(null);
    try {
      const [periodList, status, assetsData] = await Promise.all([
        fetchMonths(),
        fetchSyncStatus(),
        loadAssets(),
      ]);
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

      if (nextScope === "assets") {
        setOverview(null);
        if (!assetsData.items.length) {
          setError("Noch keine Vermögensdaten vorhanden. Bitte syncen.");
        }
        return;
      }

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
  }, [loadAssets]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (scope !== "assets" && selectedCategoryId != null && chartYear) {
      void loadCategoryChart(selectedCategoryId, chartYear);
    }
  }, [selectedCategoryId, chartYear, loadCategoryChart, scope]);

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

    if (nextScope === "assets") {
      setScope("assets");
      setSelectedCategoryId(null);
      setMonthlySeries(null);
      setLoading(true);
      setError(null);
      try {
        const data = await loadAssets();
        setOverview(null);
        if (!data.items.length) {
          setError("Noch keine Vermögensdaten vorhanden. Bitte syncen.");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Vermögen konnte nicht geladen werden");
      } finally {
        setLoading(false);
      }
      return;
    }

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
      if (scope !== "assets" && selectedCategoryId != null && chartYear) {
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

  const subtitle =
    scope === "assets"
      ? "Dein Vermögen auf einen Blick"
      : period
        ? formatMonthLabel(period)
        : "Finanzübersicht";

  return (
    <div className={`app${scope === "assets" ? " app-wide" : ""}`}>
      <header className="header">
        <div>
          <h1>{scope === "assets" ? "Vermögensübersicht" : "Kontomanager"}</h1>
          <p className="subtitle">{subtitle}</p>
        </div>
        <div className="header-actions">
          <ScopeToggle
            scope={scope}
            onChange={onScopeChange}
            hasMonths={hasMonths}
            hasYears={hasYears}
            hasAssets
          />
          {scope !== "assets" && scopedPeriods.length > 0 && period && (
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

      {loading && !(scope === "assets" ? assets : overview) ? (
        <div className="loading">Lade Daten …</div>
      ) : scope === "assets" && assets ? (
        <AssetsDashboard accounts={assets.accounts ?? []} summaryTotal={assets.total} />
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
