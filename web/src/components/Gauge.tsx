/** Half-ring gauge (red → amber → cyan) like the reference "Incident Health Score". */
export function Gauge({ value, label }: { value: number; label: string }) {
  const r = 80;
  const len = Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  const angle = Math.PI * (1 - pct);
  const tip = { x: 100 + r * Math.cos(angle), y: 100 - r * Math.sin(angle) };
  return (
    <svg viewBox="0 0 200 118" className="w-full max-w-[240px]" role="img" aria-label={`Health Score ${value} von 100, ${label}`}>
      <defs>
        <linearGradient id="gauge" x1="0" x2="1">
          <stop offset="0" stopColor="var(--color-sev-critical)" />
          <stop offset="0.45" stopColor="var(--color-sev-medium)" />
          <stop offset="1" stopColor="var(--color-primary)" />
        </linearGradient>
      </defs>
      {/* tick marks */}
      {Array.from({ length: 41 }, (_, i) => {
        const a = Math.PI * (1 - i / 40);
        const r1 = r + 9;
        const r2 = r + (i % 5 === 0 ? 14 : 11);
        return (
          <line key={i} x1={100 + r1 * Math.cos(a)} y1={100 - r1 * Math.sin(a)} x2={100 + r2 * Math.cos(a)} y2={100 - r2 * Math.sin(a)} stroke="var(--color-border-strong)" strokeWidth="1" />
        );
      })}
      <path d={`M ${100 - r} 100 A ${r} ${r} 0 0 1 ${100 + r} 100`} fill="none" stroke="var(--color-panel-3)" strokeWidth="12" strokeLinecap="round" />
      <path
        d={`M ${100 - r} 100 A ${r} ${r} 0 0 1 ${100 + r} 100`}
        fill="none"
        stroke="url(#gauge)"
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${len * pct} ${len}`}
      />
      {pct > 0 && <circle cx={tip.x} cy={tip.y} r="4" fill="var(--color-fg)" stroke="var(--color-primary)" strokeWidth="2" />}
      <text x="100" y="88" textAnchor="middle" fill="var(--color-fg)" fontSize="30" fontWeight="600">
        {value}
        <tspan fontSize="11" fill="var(--color-fg-subtle)">/100</tspan>
      </text>
      <text x="100" y="106" textAnchor="middle" fill="var(--color-primary)" fontSize="11" fontWeight="500">
        {label}
      </text>
    </svg>
  );
}
