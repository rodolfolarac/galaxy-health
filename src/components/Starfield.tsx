import { useEffect, useRef } from 'react';

/**
 * Fundo: campo de estrelas em canvas + duas nuvens de nebulosa em CSS.
 * O canvas desenha um único quadro estático quando o usuário pediu menos
 * movimento; caso contrário as estrelas derivam bem devagar.
 */
export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let stars: { x: number; y: number; r: number; a: number; tw: number; vx: number }[] = [];

    const seed = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const area = window.innerWidth * window.innerHeight;
      const count = Math.min(260, Math.round(area / 7000));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: Math.random() * 1.25 + 0.25,
        a: Math.random() * 0.6 + 0.25,
        tw: Math.random() * Math.PI * 2,
        vx: (Math.random() * 0.4 + 0.05) * 0.06,
      }));
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (const s of stars) {
        // Estrelas maiores brilham num tom levemente mais frio.
        const twinkle = reduced ? 1 : 0.72 + Math.sin(t / 900 + s.tw) * 0.28;
        ctx.globalAlpha = s.a * twinkle;
        ctx.fillStyle = s.r > 1.05 ? '#cfe4ff' : '#ffffff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();

        if (!reduced) {
          s.x += s.vx;
          if (s.x > window.innerWidth + 2) s.x = -2;
        }
      }
      ctx.globalAlpha = 1;
      if (!reduced) raf = requestAnimationFrame(draw);
    };

    const onResize = () => {
      seed();
      if (reduced) draw(0);
    };

    seed();
    if (reduced) draw(0);
    else raf = requestAnimationFrame(draw);

    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-void" />
      {/* Nuvens de nebulosa: violeta subindo pela esquerda, magenta à direita. */}
      <div
        className="absolute -left-[20vw] -top-[25vh] h-[85vh] w-[85vw] rounded-full opacity-[0.42] blur-[110px]"
        style={{ background: 'radial-gradient(circle, #6d28d9 0%, #3b1178 45%, transparent 70%)' }}
      />
      <div
        className="absolute -right-[25vw] top-[22vh] h-[70vh] w-[70vw] rounded-full opacity-[0.3] blur-[120px]"
        style={{ background: 'radial-gradient(circle, #c026a3 0%, #5b1160 48%, transparent 72%)' }}
      />
      <div
        className="absolute bottom-[-30vh] left-[25vw] h-[60vh] w-[60vw] rounded-full opacity-[0.22] blur-[130px]"
        style={{ background: 'radial-gradient(circle, #1d4ed8 0%, #0b1a52 50%, transparent 72%)' }}
      />
      <canvas ref={ref} className="absolute inset-0" />
      {/* Vinheta para o conteúdo não competir com o fundo nas bordas. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 40%, transparent 35%, rgba(7,6,15,0.55) 100%)',
        }}
      />
    </div>
  );
}
