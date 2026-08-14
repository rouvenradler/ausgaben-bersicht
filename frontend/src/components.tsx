import {
  formatEuro,
  formatMonthLabel,
  usageClass,
  type CategoryMonthlySeries,
  type CategoryRow,
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

function TrendCell({ trend }: { trend?: Trend | null }) {
  const meta = trend ? TREND_META[trend] : null;
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
}: {
  row: CategoryRow;
  color: string;
  fraction: number;
  selected: boolean;
  onSelect?: () => void;
}) {
  const soll = row.budget * fraction;
  const abw = row.spent - soll;
  const interactive = Boolean(onSelect);
  return (
    <tr
      className={[interactive ? "category-row-clickable" : "", selected ? "selected" : ""]
        .filter(Boolean)
        .join(" ")}
      onClick={onSelect}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
      tabIndex={interactive ? 0 : undefined}
      role={interactive ? "button" : undefined}
      aria-pressed={interactive ? selected : undefined}
    >
      <td className="cat-name">
        <span className="cat-dot" style={{ backgroundColor: color }} />
        {row.category_name}
      </td>
      <td className="num budget">{formatEuro(row.budget)}</td>
      <td className="num">{formatEuro(row.spent)}</td>
      <td className="num soll">{formatEuro(soll)}</td>
      <AbwCell value={abw} />
      <td className={`num ${row.remaining < 0 ? "negative" : ""}`}>
        {formatEuro(row.remaining)}
      </td>
      <td>
        <UsageCell usagePercent={row.usage_percent} />
      </td>
      <TrendCell trend={row.trend} />
    </tr>
  );
}

export function CategoryTable({
  rows,
  fraction,
  isYearView = true,
  footerLabel = "Summe",
  selectedCategoryId = null,
  onSelectCategory,
}: Props) {
  const budget = rows.reduce((s, r) => s + r.budget, 0);
  const spent = rows.reduce((s, r) => s + r.spent, 0);
  const remaining = budget - spent;
  const soll = budget * fraction;
  const abw = spent - soll;
  const usagePercent = budget > 0 ? Math.round((spent / budget) * 1000) / 10 : null;
  const periodSollLabel = isYearView ? "Soll (Jahr)" : "Soll (Monat)";

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
            return (
              <CategoryRowView
                key={row.category_id}
                row={row}
                color={color}
                fraction={fraction}
                selected={selectedCategoryId === row.category_id}
                onSelect={
                  onSelectCategory ? () => onSelectCategory(row, color) : undefined
                }
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
}

export function CategoryMonthlyChart({
  series,
  color,
  highlightMonth = null,
  loading = false,
  error = null,
  onClose,
}: ChartProps) {
  const maxValue = Math.max(
    ...series.months.map((m) => Math.max(m.spent, m.budget)),
    1,
  );

  return (
    <section className="panel chart-panel">
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
}

export function ScopeToggle({
  scope,
  onChange,
  hasMonths = true,
  hasYears = true,
}: ScopeToggleProps) {
  return (
    <div className="scope-toggle" role="group" aria-label="Zeitraum">
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
