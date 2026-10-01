import type { ExerciseKind } from './types';

/** Data local YYYY-MM-DD (o "dia" do usuário, não o dia em UTC). */
export function localDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDay(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

export function shiftDay(day: string, delta: number) {
  const d = parseDay(day);
  d.setDate(d.getDate() + delta);
  return localDay(d);
}

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function formatDay(day: string, opts: Intl.DateTimeFormatOptions = {}) {
  return parseDay(day).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    ...opts,
  });
}

/** "hoje", "ontem", "há 5 dias", "há 3 semanas". */
export function relativeDay(day: string, today = localDay()) {
  const diff = Math.round((parseDay(today).getTime() - parseDay(day).getTime()) / 86400000);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'ontem';
  if (diff < 0) return formatDay(day);
  if (diff < 14) return `há ${diff} dias`;
  if (diff < 60) return `há ${Math.round(diff / 7)} semanas`;
  return `há ${Math.round(diff / 30)} meses`;
}

/** "agora", "há 25 min", "há 3 h", ou o horário se for de outro dia. */
export function relativeTime(iso: string, now = Date.now()) {
  const diff = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (diff < 1) return 'agora';
  if (diff < 60) return `há ${diff} min`;
  if (diff < 12 * 60) return `há ${Math.floor(diff / 60)} h`;
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h${String(m).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatSeconds(sec: number) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}min${String(s).padStart(2, '0')}` : `${m}min`;
}

export function formatKg(kg: number | null | undefined) {
  if (kg == null) return '—';
  return `${kg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`;
}

export const KIND_LABEL: Record<ExerciseKind, string> = {
  strength: 'Força',
  stretch: 'Alongamento',
  mobility: 'Mobilidade',
  bodyweight: 'Peso do corpo',
  cardio: 'Cardio',
};

export const EQUIPMENT_LABEL: Record<string, string> = {
  band: 'Elástico',
  bodyweight: 'Peso do corpo',
  other: 'Outro (halter, anilha…)',
};

/** Meta de um exercício em texto curto: "3 × 8–12", "2 × 30s por lado". */
export function targetLabel(t: {
  targetSets?: number | null;
  targetReps?: number | null;
  targetRepsMax?: number | null;
  targetSeconds?: number | null;
  measure: string;
  perSide?: boolean;
}) {
  const sets = t.targetSets ?? 1;
  const side = t.perSide ? ' por lado' : '';
  if (t.measure === 'time') return `${sets} × ${t.targetSeconds ? formatSeconds(t.targetSeconds) : '—'}${side}`;
  const reps =
    t.targetReps && t.targetRepsMax && t.targetRepsMax > t.targetReps
      ? `${t.targetReps}–${t.targetRepsMax}`
      : (t.targetReps ?? t.targetRepsMax ?? '—');
  return `${sets} × ${reps}${side}`;
}

/** YouTube/Shorts → id do vídeo, para mostrar a miniatura. */
export function youtubeId(url: string) {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{6,})/);
  return m?.[1] ?? null;
}
