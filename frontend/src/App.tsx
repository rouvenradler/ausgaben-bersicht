import { useCallback, useEffect, useState } from "react";
import {
  fetchMonths,
  fetchOverview,
  fetchSyncStatus,
  formatEuro,
  formatMonthLabel,
  pickDefaultMonth,
  splitCategories,
  sumCategories,
  triggerSync,
  usageClass,
  type Overview,
  type SyncStatus,
} from "./api";
import { CategoryTable, KpiCard, MonthSelector } from "./components";

export default function App() {
  const [months, setMonths] = useState<string[]>([]);
  const [month, setMonth] = useState<string>("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (selectedMonth?: string) => {
    setLoading(true);
    setError(null);
    try {
      const [monthList, status] = await Promise.all([fetchMonths(), fetchSyncStatus()]);
      setSyncStatus(status);
      setMonths(monthList);
      const active = selectedMonth && monthList.includes(selectedMonth)
        ? selectedMonth
        : pickDefaultMonth(monthList);
      if (!active) {
        setOverview(null);
        setMonth("");
        return;
      }
      setMonth(active);
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

  const onMonthChange = async (next: string) => {
    setMonth(next);
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

  const onSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await triggerSync();
      await loadData(month);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync fehlgeschlagen");
    } finally {
      setSyncing(false);
    }
  };

  const { expenses, investments } = overview
    ? splitCategories(overview.categories)
    : { expenses: [], investments: [] };
  const expenseTotals = sumCategories(expenses);
  const expenseUsageVariant = usageClass(expenseTotals.usage_percent);

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Kontomanager</h1>
          <p className="subtitle">
            {month ? formatMonthLabel(month) : "Finanzübersicht"}
          </p>
        </div>
        <div className="header-actions">
          {months.length > 0 && (
            <MonthSelector months={months} current={month} onChange={onMonthChange} />
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
              variant={expenseTotals.remaining < 0 ? "over" : "ok"}
            />
            <KpiCard
              label="Auslastung"
              value={
                expenseTotals.usage_percent !== null
                  ? `${expenseTotals.usage_percent} %`
                  : "—"
              }
              variant={
                expenseUsageVariant === "ok" ||
                expenseUsageVariant === "warn" ||
                expenseUsageVariant === "over"
                  ? expenseUsageVariant
                  : "default"
              }
            />
          </section>

          <section className="panel">
            <h2>Ausgaben</h2>
            <CategoryTable rows={expenses} footerLabel="Summe Ausgaben" />
          </section>

          {investments.length > 0 && (
            <section className="panel panel-secondary">
              <h2>Geldanlagen</h2>
              <CategoryTable
                rows={investments}
                footerLabel="Summe Geldanlagen"
              />
            </section>
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
