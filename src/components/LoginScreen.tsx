import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { api } from '../lib/api';
import { Button, Input, Notice } from './ui';

export function LoginScreen({ onEnter }: { onEnter: () => void }) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!passcode.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.login(passcode);
      onEnter();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
      setPasscode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="relative mb-10 text-center">
          <span aria-hidden className="mb-4 block text-4xl text-nebula-soft">
            ✦
          </span>
          <h1 className="font-reader text-[2.6rem] leading-none font-normal tracking-tight text-starlight">
            Galaxy Health
          </h1>
          <p className="mt-3 text-sm text-dust">Sua ficha de treino, alongamentos e evolução.</p>
        </div>

        <form onSubmit={submit} className="glass-strong rounded-2xl p-6">
          <label htmlFor="passcode" className="mb-2 block text-sm text-dust">
            Código de acesso
          </label>
          <div className="relative">
            <KeyRound
              aria-hidden
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint"
            />
            <Input
              id="passcode"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="••••••••"
              className="pl-10 tracking-[0.3em]"
            />
          </div>

          {error && (
            <div className="mt-3">
              <Notice>{error}</Notice>
            </div>
          )}

          <Button type="submit" size="lg" disabled={busy} className="mt-5 w-full">
            {busy ? 'Verificando…' : 'Entrar'}
          </Button>

          <p className="mt-4 text-center text-xs leading-relaxed text-faint">
            Depois de entrar, este navegador fica lembrado — você não precisa digitar o código de novo. Sem o código, nada aqui pode ser lido nem alterado.
          </p>
        </form>
      </div>
    </main>
  );
}
