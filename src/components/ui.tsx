"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/* ---------------------------------------------------------------- */
/* Toasts                                                           */
/* ---------------------------------------------------------------- */

type Toast = { id: number; message: string; tone: "success" | "error" | "info" };

const ToastCtx = createContext<{ push: (message: string, tone?: Toast["tone"]) => void }>({
  push: () => {},
});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const push = useCallback((message: string, tone: Toast["tone"] = "success") => {
    seq.current += 1;
    const id = seq.current;
    setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2800);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-20 left-1/2 z-[80] flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2 md:bottom-6 md:left-auto md:right-6 md:translate-x-0"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-slide-up pointer-events-auto flex items-center gap-2.5 border px-3.5 py-2.5 text-sm font-medium shadow-lg"
            style={{
              background: "var(--card)",
              borderColor: t.tone === "error" ? "var(--danger)" : "var(--line)",
              borderRadius: "var(--radius-sm)",
              boxShadow: "var(--shadow)",
            }}
          >
            <span
              aria-hidden
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold"
              style={{
                background:
                  t.tone === "error" ? "var(--danger)" : t.tone === "info" ? "var(--accent)" : "var(--positive)",
                color: "#fff",
              }}
            >
              {t.tone === "error" ? "!" : t.tone === "info" ? "i" : "✓"}
            </span>
            <span style={{ color: "var(--fg)" }}>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------------------------------------------------------------- */
/* Modal / confirm                                                  */
/* ---------------------------------------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "32rem",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="animate-fade-in absolute inset-0"
        style={{ background: "rgba(9, 11, 16, 0.5)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-slide-up relative max-h-[92vh] w-full overflow-y-auto p-5"
        style={{
          maxWidth: width,
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow)",
        }}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold" style={{ letterSpacing: "var(--tracking)" }}>
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
                {description}
              </p>
            ) : null}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>
        {children}
        {footer ? <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      width="26rem"
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
        {message}
      </p>
    </Modal>
  );
}

/* ---------------------------------------------------------------- */
/* Small building blocks                                            */
/* ---------------------------------------------------------------- */

export function SectionHeader({
  eyebrow,
  title,
  hint,
  action,
}: {
  eyebrow?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
        <h2 className="text-xl font-semibold md:text-2xl">{title}</h2>
        {hint ? (
          <p className="mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
            {hint}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="card min-w-0 p-4">
      <p className="eyebrow">{label}</p>
      <p className="num mt-1.5 text-2xl font-bold leading-none md:text-[1.75rem]" style={{ color: accent }}>
        {value}
      </p>
      {sub ? (
        <p className="mt-1.5 text-xs" style={{ color: "var(--fg-muted)" }}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="surface inline-flex flex-wrap gap-0.5 p-0.5"
      style={{ background: "var(--bg-subtle)" }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={
              size === "sm"
                ? "rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-semibold transition-colors"
                : "rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-semibold transition-colors"
            }
            style={{
              background: active ? "var(--card)" : "transparent",
              color: active ? "var(--fg)" : "var(--fg-muted)",
              border: active ? "1px solid var(--line-strong)" : "1px solid transparent",
              boxShadow: active ? "var(--shadow-sm)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  color,
  height = 8,
  label,
}: {
  value: number;
  max: number;
  color?: string;
  height?: number;
  label?: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label ?? "progress"}
      className="w-full overflow-hidden"
      style={{ height, background: "var(--bg-subtle)", borderRadius: "999px" }}
    >
      <div
        className="progress-fill h-full"
        style={{
          width: `${pct}%`,
          background: color ?? "var(--primary)",
          borderRadius: "999px",
        }}
      />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: string;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div
        className="grid h-12 w-12 place-items-center text-2xl"
        style={{ background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)" }}
        aria-hidden
      >
        {icon}
      </div>
      <p className="text-base font-semibold">{title}</p>
      <p className="max-w-sm text-sm" style={{ color: "var(--fg-muted)" }}>
        {message}
      </p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}
