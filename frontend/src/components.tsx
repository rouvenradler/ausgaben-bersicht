import {
  formatEuro,
  formatMonthLabel,
  sumCategories,
  usageClass,
  type CategoryRow,
} from "./api";

interface Props {
  rows: CategoryRow[];
  footerLabel?: string;
  showUsage?: boolean;
}

function CategoryRowView({ row, showUsage }: { row: CategoryRow; showUsage: boolean }) {
  return (
    <tr>
      <td className="cat-name">{row.category_name}</td>
      <td className="num">{formatEuro(row.budget)}</td>
      <td className="num">{formatEuro(row.spent)}</td>
      <td className={`num ${row.remaining < 0 ? "negative" : ""}`}>
        {formatEuro(row.remaining)}
      </td>
      <td>
        {showUsage ? (
          <div className="progress-cell">
            <div className="progress-track">
              <div
                className={`progress-fill ${usageClass(row.usage_percent)}`}
                style={{ width: `${Math.min(row.usage_percent ?? 0, 100)}%` }}
              />
              {(row.usage_percent ?? 0) > 100 && (
                <div
                  className="progress-fill over"
                  style={{ width: `${Math.min((row.usage_percent ?? 0) - 100, 50)}%` }}
                />
              )}
            </div>
            <span className="progress-label">
              {row.usage_percent !== null ? `${row.usage_percent} %` : "—"}
            </span>
          </div>
        ) : (
          <span className="progress-label">—</span>
        )}
      </td>
    </tr>
  );
}

function FooterRow({
  label,
  totals,
  showUsage,
}: {
  label: string;
  totals: ReturnType<typeof sumCategories>;
  showUsage: boolean;
}) {
  return (
    <tr className="total-row">
      <td className="cat-name">{label}</td>
      <td className="num">{formatEuro(totals.budget)}</td>
      <td className="num">{formatEuro(totals.spent)}</td>
      <td className={`num ${totals.remaining < 0 ? "negative" : ""}`}>
        {formatEuro(totals.remaining)}
      </td>
      <td>
        {showUsage && totals.usage_percent !== null ? (
          <span className="progress-label total-usage">{totals.usage_percent} %</span>
        ) : (
          <span className="progress-label">—</span>
        )}
      </td>
    </tr>
  );
}

export function CategoryTable({
  rows,
  footerLabel = "Summe",
  showUsage = true,
}: Props) {
  const totals = sumCategories(rows);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Kategorie</th>
            <th className="num">Budget</th>
            <th className="num">Ist</th>
            <th className="num">Rest</th>
            <th>Auslastung</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <CategoryRowView key={row.category_id} row={row} showUsage={showUsage} />
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <FooterRow label={footerLabel} totals={totals} showUsage={showUsage} />
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
      <button type="button" onClick={prev} disabled={idx >= months.length - 1} aria-label="Vorheriger Monat">
        ‹
      </button>
      <select value={current} onChange={(e) => onChange(e.target.value)}>
        {months.map((m) => (
          <option key={m} value={m}>
            {formatMonthLabel(m)}
          </option>
        ))}
      </select>
      <button type="button" onClick={next} disabled={idx <= 0} aria-label="Nächster Monat">
        ›
      </button>
    </div>
  );
}
