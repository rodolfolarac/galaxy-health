import { useCallback, useEffect, useRef, useState } from 'react';

let audioCtx: AudioContext | null = null;

/** Bipe curto + vibração: fim do descanso ou da isometria. */
export function alertDone() {
  try {
    navigator.vibrate?.([180, 90, 180]);
  } catch {
    /* sem vibração */
  }
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    [0, 0.22].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.2);
    });
  } catch {
    /* sem áudio */
  }
}

/**
 * Contagem regressiva baseada no relógio (não em ticks), então continua
 * certa mesmo se o celular travar a aba por alguns segundos.
 */
export function useCountdown(onDone: () => void = alertDone) {
  const [endAt, setEndAt] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (endAt == null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= endAt) {
        setEndAt(null);
        doneRef.current();
      }
    }, 250);
    return () => clearInterval(id);
  }, [endAt]);

  const start = useCallback((seconds: number) => {
    setTotal(seconds);
    setNow(Date.now());
    setEndAt(Date.now() + seconds * 1000);
  }, []);
  const stop = useCallback(() => setEndAt(null), []);
  const add = useCallback((seconds: number) => {
    setEndAt((e) => (e == null ? e : e + seconds * 1000));
    setTotal((t) => t + seconds);
  }, []);

  const left = endAt == null ? 0 : Math.max(0, Math.ceil((endAt - now) / 1000));
  return { running: endAt != null, left, total, start, stop, add };
}

/** Cronômetro contínuo a partir de um valor inicial (em ms). */
export function useStopwatch(initialMs: number) {
  const startRef = useRef(Date.now() - initialMs);
  const [elapsed, setElapsed] = useState(initialMs);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startRef.current), 1000);
    return () => clearInterval(id);
  }, []);
  return elapsed;
}
