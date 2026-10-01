import { useEffect, useRef, useState } from 'react';

export type Point = { key: string; label: string; value: number; detail?: string };

/**
 * Linha de uma série só (o título do gráfico nomeia a série, então não há
 * legenda). Linha de 2px, marcadores de 8px, grade discreta e tooltip com
 * crosshair no hover/toque.
 */
export function LineChart({
  points,
  unit = '',
  height = 180,
  color = 'var(--color-nebula-soft)',
}: {
  points: Point[];
  unit?: string;
  height?: number;
  color?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  // viewBox na largura real: o texto dos eixos fica em px de verdade no celular.
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = height;
  const pad = { l: 40, r: 14, t: 14, b: 26 };

  if (points.length === 0) return null;

  const max = Math.max(...points.map((p) => p.value));
  const min = Math.min(...points.map((p) => p.value));
  const span = max - min || Math.max(1, max * 0.2);
  const lo = Math.max(0, min - span * 0.25);
  const hi = max + span * 0.25;
  const x = (i: number) =>
    points.length === 1 ? (pad.l + W - pad.r) / 2 : pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const ticks = [lo, (lo + hi) / 2, hi];
  const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: v < 10 ? 1 : 0 });
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');

  function onMove(clientX: number) {
    const svg = ref.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
  }

  const h = hover != null ? points[hover] : null;
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(W / 90))));

  return (
    <div ref={box} className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y"
        role="img"
        aria-label={`Evolução: de ${fmt(points[0]!.value)}${unit} para ${fmt(points[points.length - 1]!.value)}${unit}`}
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => onMove(e.touches[0]!.clientX)}
        onTouchMove={(e) => onMove(e.touches[0]!.clientX)}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-ridge)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--color-faint)">
              {fmt(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text
              key={p.key}
              x={x(i)}
              y={H - 6}
              textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
              fontSize={11}
              fill="var(--color-faint)"
            >
              {p.label}
            </text>
          ) : null,
        )}
        {h && hover != null && (
          <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--color-dust)" strokeDasharray="3 3" strokeWidth={1} />
        )}
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle
            key={p.key}
            cx={x(i)}
            cy={y(p.value)}
            r={hover === i ? 5.5 : 4}
            fill={color}
            stroke="var(--color-void)"
            strokeWidth={2}
          />
        ))}
      </svg>
      {h && hover != null && (
        <div
          className="glass-strong pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl px-3 py-2 text-xs whitespace-nowrap shadow-xl"
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          <p className="text-dust">{h.label}</p>
          <p className="text-sm font-semibold text-starlight">
            {fmt(h.value)}
            {unit}
          </p>
          {h.detail && <p className="text-faint">{h.detail}</p>}
        </div>
      )}
    </div>
  );
}
