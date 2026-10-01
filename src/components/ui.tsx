import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { X } from 'lucide-react';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
};

export function Button({ variant = 'primary', size = 'md', className, ...rest }: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45';
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3.5 text-base',
  }[size];
  const variants = {
    primary:
      'bg-nebula text-white hover:bg-nebula-soft shadow-[0_8px_30px_-10px_#7c3aed]',
    ghost: 'text-dust hover:text-starlight hover:bg-white/6',
    outline: 'border border-ridge text-starlight hover:border-nebula-soft hover:bg-white/5',
    danger: 'border border-rose-400/35 text-rose-200 hover:bg-rose-500/15',
  }[variant];
  return <button className={cx(base, sizes, variants, className)} {...rest} />;
}

export function Field({
  label,
  hint,
  children,
  group,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  /** Para grupos de botões (Segmented): um <label> daria nome só ao primeiro botão. */
  group?: boolean;
}) {
  const body = (
    <>
      <span className="mb-1.5 block text-sm text-dust">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </>
  );
  return group ? (
    <div role="group" aria-label={label} className="block">
      {body}
    </div>
  ) : (
    <label className="block">{body}</label>
  );
}

const inputBase =
  'w-full rounded-xl border border-ridge bg-black/25 px-3.5 py-2.5 text-starlight placeholder:text-faint transition-colors focus:border-nebula-soft focus:outline-none';

/** Sem w-full quando quem chama já define a largura (senão o w-full vence). */
function base(className?: string) {
  return /(^|\s)w-/.test(className ?? '') ? inputBase.replace('w-full ', '') : inputBase;
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(base(className), className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputBase, 'resize-y leading-relaxed', className)} {...rest} />;
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx('glass rounded-2xl', className)}>{children}</section>;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        'inline-block size-4 animate-spin rounded-full border-2 border-white/25 border-t-white',
        className,
      )}
    />
  );
}

/** Aviso de erro em linha, com a voz da interface: direto e acionável. */
export function Notice({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'info' }) {
  const styles =
    tone === 'error'
      ? 'border-rose-400/30 bg-rose-500/10 text-rose-100'
      : 'border-cyan/25 bg-cyan/10 text-cyan';
  return (
    <p role="status" className={cx('rounded-xl border px-3.5 py-2.5 text-sm', styles)}>
      {children}
    </p>
  );
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(base(className), 'appearance-none pr-8', className)} {...rest} />;
}

/** Botões de escolha única lado a lado. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      className={cx('flex flex-wrap gap-1 rounded-xl border border-ridge bg-black/25 p-1', className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
            value === o.value ? 'bg-nebula/85 text-white' : 'text-dust hover:bg-white/6 hover:text-starlight',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({
  children,
  active,
  onClick,
  color,
  className,
  title,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  color?: string;
  className?: string;
  title?: string;
}) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={title}
      aria-pressed={onClick ? !!active : undefined}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
        active
          ? 'border-nebula-soft bg-nebula/30 text-starlight'
          : 'border-ridge bg-black/20 text-dust',
        onClick && !active && 'hover:border-nebula-soft/60 hover:text-starlight',
        className,
      )}
    >
      {color && (
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full ring-1 ring-white/25"
          style={{ background: color }}
        />
      )}
      {children}
    </Tag>
  );
}

/** Janela sobreposta: folha de baixo no celular, caixa centralizada no desktop. */
export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          'glass-strong relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl sm:rounded-3xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-center gap-3 border-b border-ridge px-5 py-4">
          <h2 className="min-w-0 flex-1 truncate text-lg font-medium">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-faint hover:bg-white/6 hover:text-starlight"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="safe-bottom border-t border-ridge px-5 pt-3">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="glass flex flex-col items-center rounded-2xl px-6 py-12 text-center">
      {icon && <div className="mb-3 text-nebula-soft">{icon}</div>}
      <p className="font-reader text-2xl">{title}</p>
      {children && <div className="mt-2 max-w-md text-sm leading-relaxed text-dust">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="font-reader text-2xl leading-tight">{children}</h2>
      {action}
    </div>
  );
}

/**
 * Campo numérico que aceita vazio (null), vírgula decimal e sinal de menos.
 * Guarda o texto digitado localmente para "-" ou "12," não sumirem no meio
 * da digitação.
 */
export function NumberInput({
  value,
  onChange,
  decimal,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  decimal?: boolean;
}) {
  const [text, setText] = useState(value == null ? '' : String(value).replace('.', ','));
  const parsed = (raw: string) => {
    const t = raw.replace(',', '.').trim();
    if (t === '' || t === '-') return null;
    const n = decimal ? Number.parseFloat(t) : Number.parseInt(t, 10);
    return Number.isNaN(n) ? null : n;
  };
  // Valor mudou por fora (ex.: ✓ preencheu a meta): reflete no campo.
  useEffect(() => {
    if (parsed(text) !== (value ?? null)) setText(value == null ? '' : String(value).replace('.', ','));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Input
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        if (!/^-?\d*([.,]\d*)?$/.test(raw.trim())) return;
        setText(raw);
        onChange(parsed(raw));
      }}
      className={className}
      {...rest}
    />
  );
}

/** Mensagem curta que some sozinha (recordes, confirmações). */
export function Toast({ children, onDone, tone = 'info' }: { children: ReactNode; onDone: () => void; tone?: 'info' | 'record' }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[70] flex justify-center px-4">
      <div
        role="status"
        className={cx(
          'pop glass-strong rounded-2xl px-4 py-3 text-sm shadow-2xl',
          tone === 'record' ? 'border-amber/50 text-amber' : 'text-starlight',
        )}
      >
        {children}
      </div>
    </div>
  );
}
