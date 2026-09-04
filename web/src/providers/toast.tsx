import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/* ---------------- Toast ---------------- */

interface ToastItem {
  id: number;
  text: string;
  type: "info" | "success" | "error";
}

interface ToastContextValue {
  toasts: ToastItem[];
  push: (text: string, type?: ToastItem["type"]) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextToastId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((text: string, type: ToastItem["type"] = "info") => {
    const id = nextToastId++;
    setToasts((prev) => [...prev.slice(-3), { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  }, []);

  const value = useMemo(() => ({ toasts, push }), [toasts, push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-root" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type === "info" ? "" : t.type}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): (text: string, type?: "info" | "success" | "error") => void {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast 必须在 ToastProvider 内使用");
  return ctx.push;
}

/* ---------------- 主题 ---------------- */

const THEME_KEY = "agenthub.theme";

export function useTheme(): { theme: "light" | "dark"; toggle: () => void } {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* 隐私模式下 localStorage 可能不可用，忽略 */
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
