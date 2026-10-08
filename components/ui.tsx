"use client";
import { forwardRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger" | "settled" | "ink";
const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  secondary: "bg-card text-foreground hover:bg-secondary border border-border",
  ghost: "text-foreground hover:bg-secondary",
  danger: "bg-destructive text-destructive-foreground hover:opacity-90",
  settled: "bg-accent text-accent-foreground hover:opacity-90",
  ink: "bg-foreground text-background hover:opacity-90",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }>(
  function Button({ variant = "primary", size = "md", className, ...p }, ref) {
    const sizes = { sm: "h-8 px-3 text-mini", md: "h-10 px-4 text-mini", lg: "h-12 px-6 text-label" };
    return (
      <button
        ref={ref}
        className={cx("inline-flex items-center justify-center gap-2 rounded-sm font-mono uppercase tracking-[0.12em] transition-smooth disabled:opacity-50 disabled:pointer-events-none", variants[variant], sizes[size], className)}
        {...p}
      />
    );
  },
);

export function Card({ children, className, as: As = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" }) {
  return <As className={cx("rounded-md border border-border bg-card text-card-foreground", className)}>{children}</As>;
}

export function H2({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="text-h3 leading-tight">{children}</h2>
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-foreground">
      {children}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cx("h-10 w-full rounded-md border border-input bg-card px-3 text-body placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cx("w-full rounded-md border border-input bg-card px-3 py-2 text-body placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)} {...p} />;
});

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <div className="label text-muted-foreground">{label}</div>
      <div className="mt-2 font-display text-h2 font-semibold leading-none tracking-tight tabular">{value}</div>
      {hint && <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** The ember bar: left of today's cap glows, spent part turns to ash. */
export function EmberBar({ left, cap, label = true }: { left: number; cap: number; label?: boolean }) {
  const pct = cap > 0 ? Math.max(0, Math.min(100, (left / cap) * 100)) : 0;
  return (
    <div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-ash" role="meter" aria-valuemin={0} aria-valuemax={cap} aria-valuenow={left} aria-label="Left today">
        <div className="h-full rounded-full bg-ember transition-bar" style={{ width: `${pct}%` }} />
      </div>
      {label && (
        <div className="mt-1.5 flex justify-between text-xs text-muted-foreground tabular">
          <span>${left.toFixed(2)} left today</span>
          <span>${cap.toFixed(2)} daily cap</span>
        </div>
      )}
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-mono text-label", className)}>{children}</span>;
}

export function Copy({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied" : label}
    </Button>
  );
}

export function Notice({ tone = "muted", children }: { tone?: "muted" | "warning" | "danger" | "settled"; children: ReactNode }) {
  const tones = {
    muted: "bg-muted text-foreground",
    warning: "bg-warning/10 text-foreground border-warning/40",
    danger: "bg-destructive/10 text-foreground border-destructive/40",
    settled: "bg-accent/10 text-foreground border-accent/40",
  };
  return <div className={cx("rounded-md border border-transparent px-4 py-3 text-sm", tones[tone])}>{children}</div>;
}

export function Status({ s }: { s: string }) {
  const tone =
    s === "done" ? "text-accent" : s === "failed" || s === "cancelled" ? "text-destructive" : s === "awaiting_confirm" ? "text-warning" : "text-muted-foreground";
  const words: Record<string, string> = { done: "Done", failed: "Failed", cancelled: "Cancelled", awaiting_confirm: "Waiting for you", funding: "Funding", paying: "Paying" };
  return <span className={cx("text-sm font-medium", tone)}>{words[s] ?? s}</span>;
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string }[] }) {
  return (
    <div role="tablist" className="inline-flex rounded-md border border-border bg-secondary p-1">
      {items.map((i) => (
        <button
          key={i.value}
          role="tab"
          aria-selected={value === i.value}
          onClick={() => onChange(i.value)}
          className={cx("rounded-sm px-4 py-1.5 label transition-smooth", value === i.value ? "bg-card shadow-sm font-medium" : "text-muted-foreground hover:text-foreground")}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

export { cx };
