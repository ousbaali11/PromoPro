"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Bell, CheckCheck } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/actions/notifications-actions";

type Notif = {
  id: string;
  titre: string;
  message: string | null;
  lien: string | null;
  lu: boolean;
  createdAt: Date | number | string | null;
};

/**
 * Cloche de notifications métier. Le compteur de non-lues « pop » quand il
 * change (nouvelle notification arrivée au rechargement des données), le
 * panneau s'ouvre en léger ressort et se ferme à Échap / clic extérieur.
 */
export function NotificationBell({ notifications, dark = false }: { notifications: Notif[]; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const racine = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((n) => !n.lu).length;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDoc = (e: MouseEvent) => !racine.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open]);

  return (
    <div className="relative" ref={racine}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-fast focus-visible:outline-none focus-visible:shadow-focus",
          dark ? "text-navy-100/80 hover:bg-white/10 hover:text-white" : "text-navy-600 hover:bg-navy-50",
          open && (dark ? "bg-white/10 text-white" : "bg-navy-50"),
        )}
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="cloche-notifications"
      >
        <Bell className="h-5 w-5" />
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              key={unread}
              data-testid="cloche-compteur"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: [1.25, 1], opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: "spring", stiffness: 600, damping: 22 }}
              className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white tabular"
            >
              {unread > 9 ? "9+" : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Notifications"
            initial={{ opacity: 0, scale: 0.96, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4, transition: { duration: 0.12 } }}
            transition={{ type: "spring", stiffness: 480, damping: 32, mass: 0.7 }}
            style={{ transformOrigin: "top right" }}
            className="absolute right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-md bg-white shadow-e4 ring-1 ring-navy-100/70"
          >
            <div className="flex items-center justify-between border-b border-navy-50 px-4 py-2.5">
              <span className="text-small font-medium text-navy-900">
                Notifications
                {unread > 0 && <span className="ml-2 text-caption text-navy-400">{unread} non lue{unread > 1 ? "s" : ""}</span>}
              </span>
              {unread > 0 && (
                <button
                  className="inline-flex items-center gap-1 rounded-xs px-1.5 py-1 text-caption text-gold-600 transition-colors duration-fast hover:bg-gold-50"
                  onClick={() => startTransition(() => markAllNotificationsRead())}
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Tout marquer comme lu
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 && (
                <p className="px-4 py-8 text-center text-small text-navy-400">Aucune notification.</p>
              )}
              {notifications.map((n) => (
                <Link
                  key={n.id}
                  href={n.lien ?? "#"}
                  onClick={() => {
                    setOpen(false);
                    startTransition(() => markNotificationRead(n.id));
                  }}
                  className={cn(
                    "relative block border-b border-navy-50 py-3 pl-6 pr-4 text-small transition-colors duration-fast last:border-0 hover:bg-navy-50/70",
                    !n.lu && "bg-gold-50/60",
                  )}
                >
                  {!n.lu && <span className="absolute left-2.5 top-4 h-1.5 w-1.5 rounded-full bg-gold" aria-hidden />}
                  <p className="font-medium text-navy-900">{n.titre}</p>
                  {n.message && <p className="mt-0.5 line-clamp-2 text-caption text-navy-400">{n.message}</p>}
                  <p className="mt-1 text-[11px] text-navy-300">{formatDateTime(n.createdAt)}</p>
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
