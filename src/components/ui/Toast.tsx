"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Toasts : confirmations ponctuelles d'action (« Client créé », « Bien épinglé »).
 * À ne pas confondre avec la cloche de notifications métier (persistées en base).
 * Empilés en bas à droite (bas centré sur mobile), disparition automatique,
 * entrée avec léger ressort, sortie en fondu.
 */

export type ToastKind = "success" | "error" | "info";
export type ToastOptions = {
  title: string;
  description?: string;
  kind?: ToastKind;
  duration?: number;
  /** Action proposée dans le toast (ex. « Annuler ») : exécutée puis le toast se ferme. */
  action?: { label: string; onClick: () => void | Promise<void> };
};
type ToastItem = ToastOptions & { id: number; kind: ToastKind };

const ToastContext = createContext<{ toast: (o: ToastOptions) => void } | null>(null);

const styles: Record<ToastKind, { icon: ReactNode; classes: string }> = {
  success: { icon: <CheckCircle2 className="h-4 w-4 text-success" />, classes: "border-success-border" },
  error: { icon: <AlertCircle className="h-4 w-4 text-danger" />, classes: "border-danger-border" },
  info: { icon: <Info className="h-4 w-4 text-info" />, classes: "border-info-border" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const compteur = useRef(0);

  const fermer = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    (o: ToastOptions) => {
      const id = ++compteur.current;
      const item: ToastItem = { kind: "info", ...o, id };
      setItems((l) => [...l.slice(-4), item]); // 5 au maximum à l'écran
      const duree = o.duration ?? (item.kind === "error" ? 6000 : 4000);
      setTimeout(() => fermer(id), duree);
    },
    [fermer],
  );

  const valeur = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={valeur}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              role="status"
              data-testid="toast"
              data-kind={t.kind}
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.16 } }}
              transition={{ type: "spring", stiffness: 480, damping: 32, mass: 0.7 }}
              className={cn(
                "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border-l-4 bg-white py-3 pl-4 pr-3 shadow-e4 ring-1 ring-navy-100/70",
                styles[t.kind].classes,
              )}
            >
              <span className="mt-0.5 shrink-0">{styles[t.kind].icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-small font-medium text-navy-900">{t.title}</p>
                {t.description && <p className="mt-0.5 text-caption text-navy-400">{t.description}</p>}
                {t.action && (
                  <button
                    type="button"
                    data-testid="toast-action"
                    onClick={async () => {
                      fermer(t.id);
                      await t.action?.onClick();
                    }}
                    className="mt-2 inline-flex h-7 items-center rounded-xs bg-navy px-2.5 text-caption font-medium text-white shadow-e1 transition-[background-color,box-shadow] duration-fast hover:bg-navy-600 hover:shadow-e2 focus-visible:outline-none focus-visible:shadow-focus"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => fermer(t.id)}
                aria-label="Fermer la notification"
                className="rounded-xs p-1 text-navy-300 transition-colors duration-fast hover:bg-navy-50 hover:text-navy"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast doit être utilisé sous <ToastProvider> (src/app/layout.tsx).");
  return ctx;
}
