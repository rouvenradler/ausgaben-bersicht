import {
  formatEuro,
  formatMonthLabel,
  usageClass,
  type CategoryRow,
  type Trend,
} from "./api";

interface Props {
  rows: CategoryRow[];
  /** Anteil des bereits verstrichenen Zeitraums (0..1) für die SOLL-Berechnung. */
  fraction: number;
  footerLabel?: string;
}

const CATEGORY_COLORS = [
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

function categoryColor(index: number): string {
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

function CategoryRowView({
  row,
  color,
  fraction,
}: {
  row: CategoryRow;
  color: string;
  fraction: number;
}) {
  const soll = row.budget * fraction;
  const abw = row.spent - soll;
  return (
    <tr>
      <td className="cat-name">
        <span className="cat-dot" style={{ backgroundColor: color }} />
        {row.category_name}
      </td>
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

export function CategoryTable({ rows, fraction, footerLabel = "Summe" }: Props) {
  const budget = rows.reduce((s, r) => s + r.budget, 0);
  const spent = rows.reduce((s, r) => s + r.spent, 0);
  const remaining = budget - spent;
  const soll = budget * fraction;
  const abw = spent - soll;
  const usagePercent = budget > 0 ? Math.round((spent / budget) * 1000) / 10 : null;

  return (
    <div className="table-wrap">
      <table className="category-table">
        <thead>
          <tr>
            <th>Kategorie</th>
            <th className="num">Ist (YTD)</th>
            <th className="num">Soll (YTD)</th>
            <th className="num">Abw.</th>
            <th className="num">Rest</th>
            <th>Auslastung</th>
            <th className="trend-head">Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <CategoryRowView
              key={row.category_id}
              row={row}
              color={categoryColor(i)}
              fraction={fraction}
            />
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="total-row">
              <td className="cat-name">{footerLabel}</td>
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
