import { ArrowDown, ArrowUp, Equal, Minus, Plus, SkipForward } from 'lucide-react';
import { formatDuration, formatKg, relativeDay } from '../lib/format';
import type { CompareRow, Comparison, Trend } from '../lib/types';
import { groupSetsByLoad, LoadSummary } from './Load';
import { cx, Panel } from './ui';

const TREND_STYLE: Record<Trend, { cls: string; label: string }> = {
  up: { cls: 'text-lime', label: 'subiu' },
  down: { cls: 'text-rose-300', label: 'caiu' },
  same: { cls: 'text-faint', label: 'igual' },
  new: { cls: 'text-cyan', label: 'novo' },
  missing: { cls: 'text-amber', label: 'não fez' },
};

/** Seta + rótulo em texto: a tendência nunca depende só da cor. */
export function TrendBadge({ t, what }: { t: Trend; what: string }) {
  const s = TREND_STYLE[t];
  const Icon = t === 'up' ? ArrowUp : t === 'down' ? ArrowDown : t === 'same' ? Equal : t === 'new' ? Plus : Minus;
  return (
    <span className={cx('inline-flex items-center gap-1 text-xs', s.cls)}>
      <Icon className="size-3.5" aria-hidden />
      {what} {s.label}
    </span>
  );
}

/** Resumo de uma sessão lado a lado com a última vez do mesmo treino. */
export function ComparisonView({ data }: { data: Comparison }) {
  const { session, previousSession, totals } = data;
  const cur = totals.current;
  const prev = totals.previous;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-dust">
          {session.name} · {relativeDay(session.day)} · {formatDuration(session.durationMs)}
        </p>
        <h2 className="font-reader text-3xl">
          {previousSession ? `Comparado com a última vez (${relativeDay(previousSession.day)})` : 'Primeira vez deste treino'}
        </h2>
        {previousSession && (
          <p className="text-sm text-faint">
            Última vez do mesmo treino: {new Date(`${previousSession.day}T12:00`).toLocaleDateString('pt-BR')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <TotalTile label="Exercícios" cur={cur.exercises} prev={prev?.exercises} />
        <TotalTile label="Séries" cur={cur.sets} prev={prev?.sets} />
        <TotalTile label="Repetições" cur={cur.totalReps} prev={prev?.totalReps} />
        <TotalTile label="Volume estimado" cur={cur.volume} prev={prev?.volume} unit="kg" />
      </div>

      <div className="space-y-2">
        {data.rows.map((r) => (
          <CompareRowView key={r.exerciseId} r={r} hasPrevious={!!previousSession} />
        ))}
      </div>

      {(session.notes || session.pain || session.rpe) && (
        <Panel className="space-y-1 p-4 text-sm">
          {session.rpe && <p className="text-dust">Esforço {session.rpe}/10{session.energy ? ` · energia ${session.energy}/5` : ''}</p>}
          {session.pain && <p className="text-amber">Dor: {session.pain}</p>}
          {session.notes && <p className="whitespace-pre-line">{session.notes}</p>}
        </Panel>
      )}
    </div>
  );
}

function TotalTile({ label, cur, prev, unit }: { label: string; cur: number; prev?: number | null; unit?: string }) {
  const diff = prev != null ? cur - prev : null;
  return (
    <div className="glass rounded-2xl p-3">
      <p className="text-xs text-dust">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">
        {cur.toLocaleString('pt-BR')}
        {unit && <span className="ml-1 text-sm font-normal text-faint">{unit}</span>}
      </p>
      {diff != null && (
        <p className={cx('text-xs tabular-nums', diff > 0 ? 'text-lime' : diff < 0 ? 'text-rose-300' : 'text-faint')}>
          {diff > 0 ? '+' : ''}
          {diff.toLocaleString('pt-BR')} vs anterior
        </p>
      )}
    </div>
  );
}

function CompareRowView({ r, hasPrevious }: { r: CompareRow; hasPrevious: boolean }) {
  const isTime = r.measure === 'time';
  if (r.change === 'none') {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-ridge px-4 py-3 text-sm">
        <span className="flex-1 text-dust">{r.name}</span>
        <span className="text-xs text-faint">não feito nas duas vezes</span>
      </div>
    );
  }
  const cp = r.current?.perf;
  const pp = r.previous?.perf;

  return (
    <div className={cx('glass rounded-2xl p-4', r.change === 'skipped' && 'border-amber/40')}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 font-medium">{r.name}</p>
        {r.change === 'skipped' && (
          <span className="inline-flex items-center gap-1 text-xs text-amber">
            <SkipForward className="size-3.5" aria-hidden /> deixou de fazer hoje
          </span>
        )}
        {r.change === 'added' && <span className="text-xs text-cyan">não estava na última vez</span>}
      </div>

      {r.change === 'both' && (
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          {cp?.maxLoad != null || pp?.maxLoad != null ? <TrendBadge t={r.trends.load} what="carga" /> : null}
          {isTime ? <TrendBadge t={r.trends.seconds} what="tempo" /> : <TrendBadge t={r.trends.reps} what="reps" />}
          {(cp?.volume || pp?.volume) ? <TrendBadge t={r.trends.volume} what="volume" /> : null}
          <TrendBadge t={r.trends.sets} what="séries" />
        </div>
      )}

      <div className={cx('mt-3 grid gap-3', hasPrevious && 'sm:grid-cols-2')}>
        {hasPrevious && <Side title="Anterior" block={r.previous} isTime={isTime} muted />}
        <Side title="Hoje" block={r.current} isTime={isTime} />
      </div>
    </div>
  );
}

function Side({
  title,
  block,
  isTime,
  muted,
}: {
  title: string;
  block: CompareRow['current'];
  isTime: boolean;
  muted?: boolean;
}) {
  if (!block || !block.perf) {
    return (
      <div className="rounded-xl bg-black/15 p-3 text-sm text-faint">
        <p className="mb-1 text-xs tracking-wide uppercase">{title}</p>
        {block?.status === 'skipped' ? 'Pulado' : 'Não fez'}
        {block?.notes && <p className="mt-1 text-dust italic">“{block.notes}”</p>}
      </div>
    );
  }
  const groups = groupSetsByLoad(block.sets, block.measure);
  return (
    <div className={cx('rounded-xl p-3 text-sm', muted ? 'bg-black/15' : 'bg-nebula/10')}>
      <p className="mb-1 text-xs tracking-wide text-faint uppercase">{title}</p>
      <div className="space-y-1">
        {groups.map((g, i) => (
          <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <LoadSummary value={g.set} showEmpty={false} />
            <span className="text-lg font-semibold tabular-nums">{g.values.join(' · ')}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-dust">
        {block.perf.sets} séries
        {isTime ? ` · ${block.perf.totalSeconds}s no total` : ` · ${block.perf.totalReps} reps`}
        {block.perf.maxLoad != null && ` · máx ≈ ${formatKg(block.perf.maxLoad)}`}
      </p>
      {block.sets.some((s) => s.notes) && (
        <ol className="mt-1.5 space-y-0.5">
          {block.sets
            .filter((s) => s.notes)
            .map((s) => (
              <li key={s.id} className="text-dust">
                <span className="text-xs text-faint">S{s.position + 1} · {isTime ? `${s.seconds}s` : `${s.reps} reps`} — </span>
                <span className="italic">“{s.notes}”</span>
              </li>
            ))}
        </ol>
      )}
      {block.notes && <p className="mt-1 text-dust italic">“{block.notes}”</p>}
    </div>
  );
}
