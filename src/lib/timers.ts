import { useCallback, useEffect, useRef, useState } from 'react';

let audioCtx: AudioContext | null = null;

/**
 * Celulares (principalmente o Safari do iPhone) só deixam tocar som depois de
 * um toque do usuário. Este destravamento roda no primeiro toque na tela e
 * deixa o áudio pronto para os bipes que vêm depois, sozinhos, do timer.
 */
export function unlockAudio() {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    // Um som mudo de 1 amostra "acorda" o áudio no iOS.
    const buf = audioCtx.createBuffer(1, 1, 22050);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);
    src.start(0);
  } catch {
    /* sem áudio */
  }
}

function beep(freq: number, offset: number, duration: number, volume = 0.3) {
  const ctx = audioCtx;
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  const t = ctx.currentTime + offset;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

function vibrate(pattern: number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* iPhone não vibra pelo navegador */
  }
}

/** Bipe curto de contagem (3, 2, 1). */
export function tick() {
  beep(660, 0, 0.09, 0.18);
  vibrate([40]);
}

/**
 * Fim do timer. Descanso: dois bipes ("pode ir"). Exercício: três bipes mais
 * agudos e longos ("pode parar").
 */
export function alertDone(kind: 'rest' | 'work' = 'rest') {
  if (kind === 'work') {
    [0, 0.25, 0.5].forEach((o) => beep(1046, o, 0.22, 0.35));
    vibrate([250, 100, 250, 100, 250]);
  } else {
    [0, 0.22].forEach((o) => beep(880, o, 0.18, 0.3));
    vibrate([180, 90, 180]);
  }
}

/**
 * Relógio monotônico: só anda para frente. O relógio de parede (Date.now)
 * pode pular quando o sistema acerta a hora pela rede, o que encerraria um
 * timer antes da hora (ou nunca).
 */
const clock = () => performance.now();

/**
 * Contagem regressiva baseada no relógio (não em ticks), então continua
 * certa mesmo se o celular travar a aba por alguns segundos. Bipa nos três
 * últimos segundos e chama `onDone` no fim.
 */
export function useCountdown(onDone: () => void = () => alertDone('rest')) {
  const [endAt, setEndAt] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [now, setNow] = useState(clock);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    if (endAt == null) return;
    const id = setInterval(() => {
      const t = clock();
      setNow(t);
      const left = Math.ceil((endAt - t) / 1000);
      if (left >= 1 && left <= 3 && lastTick.current !== left) {
        lastTick.current = left;
        tick();
      }
      if (t >= endAt) {
        setEndAt(null);
        doneRef.current();
      }
    }, 200);
    return () => clearInterval(id);
  }, [endAt]);

  const start = useCallback((seconds: number) => {
    lastTick.current = null;
    const t = clock();
    setTotal(seconds);
    setNow(t);
    setEndAt(t + seconds * 1000);
  }, []);
  const stop = useCallback(() => setEndAt(null), []);
  const add = useCallback((seconds: number) => {
    lastTick.current = null;
    setEndAt((e) => (e == null ? e : e + seconds * 1000));
    setTotal((t) => t + seconds);
  }, []);

  const left = endAt == null ? 0 : Math.max(0, Math.ceil((endAt - now) / 1000));
  return { running: endAt != null, left, total, start, stop, add };
}

/** Cronômetro contínuo a partir de um valor inicial (em ms). */
export function useStopwatch(initialMs: number) {
  const startRef = useRef(clock() - initialMs);
  const [elapsed, setElapsed] = useState(initialMs);
  useEffect(() => {
    // Arredondado: o servidor guarda a duração em ms inteiros.
    const id = setInterval(() => setElapsed(Math.round(clock() - startRef.current)), 1000);
    return () => clearInterval(id);
  }, []);
  return elapsed;
}

/**
 * Mantém a tela acesa enquanto `active` (treino aberto): com a tela apagada o
 * navegador congela os timers e os bipes não tocam. Pede de novo ao voltar
 * para o app, porque o sistema solta a trava ao trocar de aba.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) void lock.release();
      } catch {
        /* sem permissão ou sem suporte */
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && void request();
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [active]);
}

/** Preferência guardada no navegador (ex.: descanso automático ligado/desligado). */
export function useLocalFlag(key: string, initial: boolean) {
  const [value, setValue] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v == null ? initial : v === '1';
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (v: boolean) => {
      setValue(v);
      try {
        localStorage.setItem(key, v ? '1' : '0');
      } catch {
        /* navegação privada */
      }
    },
    [key],
  );
  return [value, set] as const;
}
