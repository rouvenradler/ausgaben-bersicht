import { Fragment, useEffect, useState } from "react";
import {
  formatEuro,
  formatMonthLabel,
  usageClass,
  type CategoryMonthlySeries,
  type CategoryRow,
  type CategoryTransaction,
  type CategoryTransactions,
  type PeriodScope,
  type Trend,
} from "./api";

interface Props {
  rows: CategoryRow[];
  /** Anteil des bereits verstrichenen Zeitraums (0..1) für die SOLL-Berechnung. */
  fraction: number;
  /** true = Jahresübersicht → Spalte „Soll (Jahr)“, sonst „Soll (Monat)“. */
  isYearView?: boolean;
  footerLabel?: string;
  selectedCategoryId?: number | null;
  onSelectCategory?: (row: CategoryRow, color: string) => void;
  onSelectSpent?: (row: CategoryRow) => void;
  chartSeries?: CategoryMonthlySeries | null;
  chartYear?: string;
  chartColor?: string;
  chartHighlightMonth?: string | null;
  chartLoading?: boolean;
  chartError?: string | null;
  onCloseChart?: () => void;
}

export const CATEGORY_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#84cc16",
  "#06b6d4",
  "#a855f7",
  "#f59e0b",
  "#10b981",
];

export function categoryColor(index: number): string {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

function UsageCell({ usagePercent }: { usagePercent: number | null }) {
  if (usagePercent === null) {
    return (
      <div className="progress-cell">
        <span className="progress-label">—</span>
      </div>
    );
  }
  return (
    <div className="progress-cell">
      <div className="progress-track">
        <div
          className={`progress-fill ${usageClass(usagePercent)}`}
          style={{ width: `${Math.min(usagePercent, 100)}%` }}
        />
        {usagePercent > 100 && (
          <div
            className="progress-fill over"
            style={{ width: `${Math.min(usagePercent - 100, 50)}%` }}
          />
        )}
      </div>
      <span className="progress-label">{usagePercent} %</span>
    </div>
  );
}

function AbwCell({ value }: { value: number }) {
  const over = value > 0.005;
  const under = value < -0.005;
  const cls = over ? "negative" : under ? "positive" : "";
  return (
    <td className={`num ${cls}`}>
      {over ? "+" : ""}
      {formatEuro(value)}
    </td>
  );
}

const TREND_META: Record<Trend, { symbol: string; cls: string; title: string }> = {
  up: { symbol: "↑", cls: "trend-up", title: "Ausgaben gestiegen ggü. Vormonat" },
  down: { symbol: "↓", cls: "trend-down", title: "Ausgaben gesunken ggü. Vormonat" },
  flat: { symbol: "→", cls: "trend-flat", title: "Ausgaben etwa gleich ggü. Vormonat" },
};

function TrendCell({
  trend,
  selected = false,
  onSelect,
}: {
  trend?: Trend | null;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const meta = trend ? TREND_META[trend] : null;
  const title = onSelect
    ? selected
      ? "Monatsverlauf schließen"
      : "Monatsverlauf anzeigen"
    : (meta?.title ?? "Kein Vergleich verfügbar");

  if (!onSelect) {
    return (
      <td className="trend-cell">
        <span
          className={`trend ${meta?.cls ?? "trend-none"}`}
          title={meta?.title ?? "Kein Vergleich verfügbar"}
        >
          {meta?.symbol ?? "–"}
        </span>
      </td>
    );
  }

  return (
    <td className="trend-cell">
      <button
        type="button"
        className={`trend trend-btn ${meta?.cls ?? "trend-none"}${selected ? " selected" : ""}`}
        title={title}
        aria-label={title}
        aria-pressed={selected}
        aria-expanded={selected}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        {meta?.symbol ?? "–"}
      </button>
    </td>
  );
}

function shortMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("de-DE", { month: "short" });
}

function CategoryRowView({
  row,
  color,
  fraction,
  selected,
  onSelect,
  onSelectSpent,
}: {
  row: CategoryRow;
  color: string;
  fraction: number;
  selected: boolean;
  onSelect?: () => void;
  onSelectSpent?: () => void;
}) {
  const soll = row.budget * fraction;
  const abw = row.spent - soll;
  return (
    <tr className={selected ? "category-row-selected" : undefined}>
      <td className="cat-name">
        <span className="cat-dot" style={{ backgroundColor: color }} />
        {row.category_name}
      </td>
      <td className="num budget">{formatEuro(row.budget)}</td>
      <td className="num">
        {onSelectSpent ? (
          <button
            type="button"
            className="spent-btn"
            title="Buchungen anzeigen"
            aria-label={`Buchungen für ${row.category_name} anzeigen`}
            onClick={(e) => {
              e.stopPropagation();
              onSelectSpent();
            }}
          >
            {formatEuro(row.spent)}
          </button>
        ) : (
          formatEuro(row.spent)
        )}
      </td>
      <td className="num soll">{formatEuro(soll)}</td>
      <AbwCell value={abw} />
      <td className={`num ${row.remaining < 0 ? "negative" : ""}`}>
        {formatEuro(row.remaining)}
      </td>
      <td>
        <UsageCell usagePercent={row.usage_percent} />
      </td>
      <TrendCell trend={row.trend} selected={selected} onSelect={onSelect} />
    </tr>
  );
}

function CategoryRowGroup({
  row,
  color,
  fraction,
  selected,
  onSelect,
  onSelectSpent,
  showChart,
  chartSeries,
  chartYear,
  chartColor,
  chartHighlightMonth,
  chartLoading,
  chartError,
  onCloseChart,
}: {
  row: CategoryRow;
  color: string;
  fraction: number;
  selected: boolean;
  onSelect?: () => void;
  onSelectSpent?: () => void;
  showChart: boolean;
  chartSeries: CategoryMonthlySeries | null;
  chartYear: string;
  chartColor: string;
  chartHighlightMonth: string | null;
  chartLoading: boolean;
  chartError: string | null;
  onCloseChart?: () => void;
}) {
  return (
    <>
      <CategoryRowView
        row={row}
        color={color}
        fraction={fraction}
        selected={selected}
        onSelect={onSelect}
        onSelectSpent={onSelectSpent}
      />
      {showChart && onCloseChart && (
        <tr className="chart-expand-row">
          <td colSpan={8}>
            <div
              className="chart-expand-inner"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <CategoryMonthlyChart
                series={
                  chartSeries ?? {
                    category_id: row.category_id,
                    category_name: row.category_name,
                    year: chartYear || String(new Date().getFullYear()),
                    months: Array.from({ length: 12 }, (_, i) => ({
                      year_month: `${chartYear || new Date().getFullYear()}-${String(i + 1).padStart(2, "0")}`,
                      budget: 0,
                      spent: 0,
                    })),
                  }
                }
                color={chartColor}
                highlightMonth={chartHighlightMonth}
                loading={chartLoading && !chartSeries}
                error={chartError}
                onClose={onCloseChart}
                inline
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function CategoryTable({
  rows,
  fraction,
  isYearView = true,
  footerLabel = "Summe",
  selectedCategoryId = null,
  onSelectCategory,
  onSelectSpent,
  chartSeries = null,
  chartYear = "",
  chartColor = "#3b82f6",
  chartHighlightMonth = null,
  chartLoading = false,
  chartError = null,
  onCloseChart,
}: Props) {
  const budget = rows.reduce((s, r) => s + r.budget, 0);
  const spent = rows.reduce((s, r) => s + r.spent, 0);
  const remaining = budget - spent;
  const soll = budget * fraction;
  const abw = spent - soll;
  const usagePercent = budget > 0 ? Math.round((spent / budget) * 1000) / 10 : null;
  const periodSollLabel = isYearView ? "Soll (Jahr)" : "Soll (Monat)";
  const showChart =
    selectedCategoryId != null &&
    Boolean(onCloseChart) &&
    Boolean(chartSeries || chartLoading || chartError);

  return (
    <div className="table-wrap">
      <table className="category-table">
        <thead>
          <tr>
            <th>Kategorie</th>
            <th className="num">{periodSollLabel}</th>
            <th className="num">Ist (YTD)</th>
            <th className="num">Soll (YTD)</th>
            <th className="num">Abw.</th>
            <th className="num">Rest</th>
            <th>Auslastung</th>
            <th className="trend-head">Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const color = categoryColor(i);
            const selected = selectedCategoryId === row.category_id;
            return (
              <CategoryRowGroup
                key={row.category_id}
                row={row}
                color={color}
                fraction={fraction}
                selected={selected}
                onSelect={
                  onSelectCategory ? () => onSelectCategory(row, color) : undefined
                }
                onSelectSpent={onSelectSpent ? () => onSelectSpent(row) : undefined}
                showChart={showChart && selected}
                chartSeries={chartSeries}
                chartYear={chartYear}
                chartColor={chartColor}
                chartHighlightMonth={chartHighlightMonth}
                chartLoading={chartLoading}
                chartError={chartError}
                onCloseChart={onCloseChart}
              />
            );
          })}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="total-row">
              <td className="cat-name">{footerLabel}</td>
              <td className="num budget">{formatEuro(budget)}</td>
              <td className="num">{formatEuro(spent)}</td>
              <td className="num soll">{formatEuro(soll)}</td>
              <AbwCell value={abw} />
              <td className={`num ${remaining < 0 ? "negative" : ""}`}>
                {formatEuro(remaining)}
              </td>
              <td>
                <UsageCell usagePercent={usagePercent} />
              </td>
              <td className="trend-cell" />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

interface ChartProps {
  series: CategoryMonthlySeries;
  color: string;
  highlightMonth?: string | null;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  inline?: boolean;
}

export function CategoryMonthlyChart({
  series,
  color,
  highlightMonth = null,
  loading = false,
  error = null,
  onClose,
  inline = false,
}: ChartProps) {
  const maxValue = Math.max(
    ...series.months.map((m) => Math.max(m.spent, m.budget)),
    1,
  );

  return (
    <section className={`panel chart-panel${inline ? " chart-panel-inline" : ""}`}>
      <div className="chart-header">
        <div>
          <h2>
            <span className="cat-dot" style={{ backgroundColor: color }} />
            {series.category_name}
          </h2>
          <p className="chart-subtitle">Ausgaben pro Monat · Jahr {series.year}</p>
        </div>
        <button type="button" className="chart-close" onClick={onClose} aria-label="Diagramm schließen">
          Schließen
        </button>
      </div>

      {loading ? (
        <div className="loading">Lade Monatsverlauf …</div>
      ) : error ? (
        <div className="banner error">{error}</div>
      ) : (
        <>
          <div className="bar-chart" role="img" aria-label={`Monatsausgaben ${series.category_name}`}>
            {series.months.map((m) => {
              const spentPct = (m.spent / maxValue) * 100;
              const budgetPct = (m.budget / maxValue) * 100;
              const over = m.budget > 0 && m.spent > m.budget + 0.005;
              const active = highlightMonth === m.year_month;
              return (
                <div
                  key={m.year_month}
                  className={`bar-col${active ? " active" : ""}`}
                  title={`${formatMonthLabel(m.year_month)}: ${formatEuro(m.spent)} (Budget ${formatEuro(m.budget)})`}
                >
                  <div className="bar-track">
                    {m.budget > 0 && (
                      <div
                        className="bar-budget"
                        style={{ height: `${budgetPct}%` }}
                      />
                    )}
                    <div
                      className={`bar-spent${over ? " over" : ""}`}
                      style={{
                        height: `${spentPct}%`,
                        backgroundColor: over ? undefined : color,
                      }}
                    />
                  </div>
                  <span className="bar-label">{shortMonthLabel(m.year_month)}</span>
                  <span className="bar-value">{m.spent > 0 ? formatEuro(m.spent) : "–"}</span>
                </div>
              );
            })}
          </div>
          <div className="chart-legend">
            <span>
              <i className="legend-swatch spent" style={{ backgroundColor: color }} /> Ist
            </span>
            <span>
              <i className="legend-swatch budget" /> Monatsbudget
            </span>
          </div>
        </>
      )}
    </section>
  );
}

function formatBookingDate(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(isoDate)) return isoDate;
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("de-DE");
}

function fullMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });
}

function groupTransactionsByMonth(items: CategoryTransaction[]): {
  yearMonth: string;
  items: CategoryTransaction[];
}[] {
  const groups: { yearMonth: string; items: CategoryTransaction[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.yearMonth === item.year_month) {
      last.items.push(item);
    } else {
      groups.push({ yearMonth: item.year_month, items: [item] });
    }
  }
  return groups;
}

interface TransactionsModalProps {
  data: CategoryTransactions | null;
  loading?: boolean;
  error?: string | null;
  groupByMonth?: boolean;
  onClose: () => void;
}

export function TransactionsModal({
  data,
  loading = false,
  error = null,
  groupByMonth = false,
  onClose,
}: TransactionsModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = data
    ? `${data.category_name} · ${
        data.period.length === 4 ? data.period : formatMonthLabel(data.period)
      }`
    : "Buchungen";

  const groups =
    data && groupByMonth ? groupTransactionsByMonth(data.items) : null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tx-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="tx-modal-title">{title}</h2>
            <p className="modal-subtitle">Einzelbuchungen</p>
          </div>
          <button type="button" className="chart-close" onClick={onClose}>
            Schließen
          </button>
        </div>

        {loading ? (
          <div className="loading">Lade Buchungen …</div>
        ) : error ? (
          <div className="banner error">{error}</div>
        ) : !data || data.items.length === 0 ? (
          <div className="empty-accounts">Keine Buchungen für diesen Zeitraum</div>
        ) : (
          <>
            <div className="tx-table-wrap">
              <table className="tx-table">
                <thead>
                  <tr>
                    <th>Buchungsdatum</th>
                    <th>Zahlungsempfänger*in</th>
                    <th className="num">Betrag (€)</th>
                  </tr>
                </thead>
                <tbody>
                  {groups
                    ? groups.map((group) => (
                        <Fragment key={group.yearMonth}>
                          <tr className="tx-month-head">
                            <td colSpan={3}>{fullMonthLabel(group.yearMonth)}</td>
                          </tr>
                          {group.items.map((item, idx) => (
                            <tr key={`${group.yearMonth}-${item.date}-${item.payee}-${idx}`}>
                              <td>{formatBookingDate(item.date)}</td>
                              <td>{item.payee || "—"}</td>
                              <td className={`num ${item.amount < 0 ? "negative" : "positive"}`}>
                                {formatEuro(item.amount)}
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      ))
                    : data.items.map((item, idx) => (
                        <tr key={`${item.date}-${item.payee}-${idx}`}>
                          <td>{formatBookingDate(item.date)}</td>
                          <td>{item.payee || "—"}</td>
                          <td className={`num ${item.amount < 0 ? "negative" : "positive"}`}>
                            {formatEuro(item.amount)}
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
            <div className="tx-footer">
              <span>
                {data.count} Buchung{data.count === 1 ? "" : "en"}
              </span>
              <strong>Summe Ausgänge: {formatEuro(data.total)}</strong>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface KpiProps {
  label: string;
  value: string;
  sub?: string;
  variant?: "default" | "warn" | "over" | "ok";
}

export function KpiCard({ label, value, sub, variant = "default" }: KpiProps) {
  return (
    <div className={`kpi-card ${variant}`}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

interface ScopeToggleProps {
  scope: PeriodScope;
  onChange: (scope: PeriodScope) => void;
  hasMonths?: boolean;
  hasYears?: boolean;
  hasAssets?: boolean;
}

export function ScopeToggle({
  scope,
  onChange,
  hasMonths = true,
  hasYears = true,
  hasAssets = true,
}: ScopeToggleProps) {
  return (
    <div className="scope-toggle" role="group" aria-label="Ansicht">
      <button
        type="button"
        className={scope === "assets" ? "active" : ""}
        aria-pressed={scope === "assets"}
        disabled={!hasAssets}
        onClick={() => onChange("assets")}
      >
        Vermögen
      </button>
      <button
        type="button"
        className={scope === "month" ? "active" : ""}
        aria-pressed={scope === "month"}
        disabled={!hasMonths}
        onClick={() => onChange("month")}
      >
        Monat
      </button>
      <button
        type="button"
        className={scope === "year" ? "active" : ""}
        aria-pressed={scope === "year"}
        disabled={!hasYears}
        onClick={() => onChange("year")}
      >
        Jahr
      </button>
    </div>
  );
}

interface AssetsTableProps {
  items: { name: string; value: number }[];
  total: number;
}

export function AssetsTable({ items, total }: AssetsTableProps) {
  return (
    <div className="table-wrap">
      <table className="category-table assets-table">
        <thead>
          <tr>
            <th>Vermögen</th>
            <th className="num">Wert</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.name}>
              <td className="cat-name">
                <span className="cat-dot" style={{ backgroundColor: categoryColor(i) }} />
                {item.name}
              </td>
              <td className="num">{formatEuro(item.value)}</td>
            </tr>
          ))}
        </tbody>
        {items.length > 0 && (
          <tfoot>
            <tr className="total-row">
              <td className="cat-name">Summe</td>
              <td className="num">{formatEuro(total)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

const ASSET_GROUP_ORDER = [
  "Girokonto",
  "Tagesgeld Konto",
  "Festgeld Konto",
  "Wertpapiere",
  "Einzelaktien",
] as const;

const ASSET_GROUP_META: Record<
  string,
  { label: string; short: string; tone: string; icon: string }
> = {
  Girokonto: { label: "Girokonten", short: "Girokonto", tone: "giro", icon: "€" },
  "Tagesgeld Konto": { label: "Tagesgeld", short: "Tagesgeld", tone: "tagesgeld", icon: "%" },
  "Festgeld Konto": { label: "Festgeld", short: "Festgeld", tone: "festgeld", icon: "⏱" },
  Wertpapiere: { label: "Wertpapiere", short: "Wertpapiere", tone: "wp", icon: "↗" },
  Einzelaktien: { label: "Einzelaktien", short: "Aktien", tone: "wp", icon: "■" },
};

type OwnerFilter = "all" | "Rouven" | "Lena";
type GroupFilter = "all" | (typeof ASSET_GROUP_ORDER)[number];

function matchesOwner(owner: string | undefined, filter: OwnerFilter): boolean {
  if (filter === "all") return true;
  return owner === filter;
}

function shareLabel(value: number, total: number): string {
  if (total <= 0) return "0,0 %";
  return `${((value / total) * 100).toLocaleString("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} %`;
}

interface AssetsDashboardProps {
  accounts: AssetAccountLike[];
  summaryTotal: number;
}

type AssetAccountLike = {
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
};

export function AssetsDashboard({ accounts, summaryTotal }: AssetsDashboardProps) {
  const [owner, setOwner] = useState<OwnerFilter>("all");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");

  const visible = accounts.filter((account) => matchesOwner(account.owner, owner));
  const filtered =
    groupFilter === "all" ? visible : visible.filter((account) => account.group === groupFilter);
  const total = visible.reduce((sum, account) => sum + account.value, 0);
  const displayTotal = owner === "all" && summaryTotal > 0 ? summaryTotal : total;

  const sumGroup = (group: string) =>
    visible.filter((account) => account.group === group).reduce((sum, account) => sum + account.value, 0);

  const kpiGroups = ["Girokonto", "Tagesgeld Konto", "Wertpapiere"] as const;

  return (
    <div className="assets-dashboard">
      <section className="panel owner-panel">
        <h2>Ansicht wählen</h2>
        <div className="owner-cards">
          {(
            [
              { id: "all", title: "Gesamt", sub: "Rouven & Lena" },
              { id: "Rouven", title: "Rouven", sub: "Nur dein Vermögen" },
              { id: "Lena", title: "Lena", sub: "Nur Lenas Vermögen" },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              className={`owner-card${owner === option.id ? " active" : ""}`}
              onClick={() => setOwner(option.id)}
            >
              <strong>{option.title}</strong>
              <span>{option.sub}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="kpis assets-kpis">
        <div className="kpi-card ok">
          <span className="kpi-label">Gesamtvermögen</span>
          <span className="kpi-value">{formatEuro(displayTotal)}</span>
        </div>
        {kpiGroups.map((group) => {
          const meta = ASSET_GROUP_META[group];
          const value = sumGroup(group);
          return (
            <div key={group} className={`kpi-card asset-kpi ${meta.tone}`}>
              <span className="kpi-label">{meta.short}</span>
              <span className="kpi-value">{formatEuro(value)}</span>
              <span className="kpi-sub">{shareLabel(value, displayTotal)} vom Vermögen</span>
            </div>
          );
        })}
      </section>

      <section className="panel assets-detail-panel">
        <div className="assets-detail-layout">
          <nav className="assets-sidebar" aria-label="Konten & Depot">
            <p className="sidebar-title">Konten & Depot</p>
            <button
              type="button"
              className={groupFilter === "all" ? "active" : ""}
              onClick={() => setGroupFilter("all")}
            >
              Alle Konten
            </button>
            {ASSET_GROUP_ORDER.filter((group) => group !== "Einzelaktien").map((group) => (
              <button
                key={group}
                type="button"
                className={groupFilter === group ? "active" : ""}
                onClick={() => setGroupFilter(group)}
              >
                {ASSET_GROUP_META[group].label}
              </button>
            ))}
          </nav>

          <div className="table-wrap">
            <table className="category-table assets-detail-table">
              <thead>
                <tr>
                  <th>Konto / Depot</th>
                  <th>Institut / Anbieter</th>
                  <th>Inhaber</th>
                  <th className="num">Betrag</th>
                </tr>
              </thead>
              {ASSET_GROUP_ORDER.filter(
                (group) => groupFilter === "all" || groupFilter === group,
              ).map((group) => {
                const rows = filtered.filter((account) => account.group === group);
                const groupTotal = rows.reduce((sum, row) => sum + row.value, 0);
                const meta = ASSET_GROUP_META[group];
                return (
                  <tbody key={group}>
                    <tr className={`group-head ${meta.tone}`}>
                      <td colSpan={3}>{meta.label}</td>
                      <td className="num">{formatEuro(groupTotal)}</td>
                    </tr>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="empty-accounts">
                          Keine {meta.label} vorhanden
                        </td>
                      </tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={`${row.group}-${row.name}-${row.iban}`}>
                          <td className="cat-name">{row.name}</td>
                          <td>{row.institute || "—"}</td>
                          <td>{row.owner || "—"}</td>
                          <td className="num">{formatEuro(row.value)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                );
              })}
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeDonutSlice(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number,
): string {
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const outerStart = polarToCartesian(cx, cy, outerR, endAngle);
  const outerEnd = polarToCartesian(cx, cy, outerR, startAngle);
  const innerStart = polarToCartesian(cx, cy, innerR, startAngle);
  const innerEnd = polarToCartesian(cx, cy, innerR, endAngle);
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 0 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 1 ${innerEnd.x} ${innerEnd.y}`,
    "Z",
  ].join(" ");
}

interface AssetsDonutProps {
  items: { name: string; value: number }[];
  total: number;
}

export function AssetsDonutChart({ items, total }: AssetsDonutProps) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 96;
  const innerR = 58;

  let angle = 0;
  const slices =
    total > 0
      ? items
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => item.value > 0)
          .map(({ item, index }) => {
            const sweep = (item.value / total) * 360;
            const start = angle;
            const end = angle + sweep;
            angle = end;
            const safeEnd = sweep >= 359.99 ? start + 359.99 : end;
            return {
              name: item.name,
              value: item.value,
              color: categoryColor(index),
              path: describeDonutSlice(cx, cy, outerR, innerR, start, safeEnd),
              percent: Math.round((item.value / total) * 1000) / 10,
            };
          })
      : [];

  return (
    <div className="assets-donut">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        role="img"
        aria-label="Vermögensverteilung"
      >
        {slices.length === 0 ? (
          <circle cx={cx} cy={cy} r={outerR} fill="var(--surface-2)" />
        ) : (
          slices.map((slice) => (
            <path
              key={slice.name}
              d={slice.path}
              fill={slice.color}
              stroke="var(--surface)"
              strokeWidth="2"
            >
              <title>
                {slice.name}: {formatEuro(slice.value)} ({slice.percent} %)
              </title>
            </path>
          ))
        )}
        <circle cx={cx} cy={cy} r={innerR - 1} fill="var(--surface)" />
        <text x={cx} y={cy - 6} textAnchor="middle" className="donut-center-label">
          Gesamt
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="donut-center-value">
          {formatEuro(total)}
        </text>
      </svg>
      <ul className="assets-donut-legend">
        {items.map((item, i) => {
          const percent = total > 0 ? Math.round((item.value / total) * 1000) / 10 : 0;
          return (
            <li key={item.name}>
              <span className="cat-dot" style={{ backgroundColor: categoryColor(i) }} />
              <span className="legend-name">{item.name}</span>
              <span className="legend-pct">{percent} %</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface MonthNavProps {
  months: string[];
  current: string;
  onChange: (month: string) => void;
}

export function MonthSelector({ months, current, onChange }: MonthNavProps) {
  const idx = months.indexOf(current);

  const prev = () => {
    if (idx < months.length - 1) onChange(months[idx + 1]);
  };
  const next = () => {
    if (idx > 0) onChange(months[idx - 1]);
  };

  return (
    <div className="month-nav">
      <button type="button" onClick={prev} disabled={idx >= months.length - 1} aria-label="Vorheriger Zeitraum">
        ‹
      </button>
      <select value={current} onChange={(e) => onChange(e.target.value)}>
        {months.map((m) => (
          <option key={m} value={m}>
            {formatMonthLabel(m)}
          </option>
        ))}
      </select>
      <button type="button" onClick={next} disabled={idx <= 0} aria-label="Nächster Zeitraum">
        ›
      </button>
    </div>
  );
}
