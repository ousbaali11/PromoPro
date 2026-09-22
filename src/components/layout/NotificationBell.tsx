"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
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

export function NotificationBell({ notifications, dark = false }: { notifications: Notif[]; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const unread = notifications.filter((n) => !n.lu).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-full",
          dark ? "text-navy-100/80 hover:bg-white/10 hover:text-white" : "text-navy-600 hover:bg-navy-50",
        )}
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-2 w-2 rounded-full bg-gold" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-lg bg-white shadow-xl ring-1 ring-navy-100">
            <div className="flex items-center justify-between border-b border-navy-50 px-4 py-2.5">
              <span className="text-sm font-medium text-navy-900">Notifications</span>
              {unread > 0 && (
                <button
                  className="text-xs text-gold-600 hover:underline"
                  onClick={() => startTransition(() => markAllNotificationsRead())}
                >
                  Tout marquer comme lu
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-navy-400">Aucune notification.</p>
              )}
              {notifications.map((n) => (
                <Link
                  key={n.id}
                  href={n.lien ?? "#"}
                  onClick={() => startTransition(() => markNotificationRead(n.id))}
                  className={cn(
                    "block border-b border-navy-50 px-4 py-3 text-sm last:border-0 hover:bg-navy-50",
                    !n.lu && "bg-gold-50",
                  )}
                >
                  <p className="font-medium text-navy-900">{n.titre}</p>
                  {n.message && <p className="mt-0.5 text-xs text-navy-400">{n.message}</p>}
                  <p className="mt-1 text-[11px] text-navy-400/70">{formatDateTime(n.createdAt)}</p>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
