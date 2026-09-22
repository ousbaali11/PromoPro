import { desc, eq } from "drizzle-orm";
import { requireStaffSession } from "@/lib/session";
import { db } from "@/db/client";
import { notifications as notificationsTable } from "@/db/schema";
import { Sidebar } from "@/components/layout/Sidebar";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { ROLE_LABELS } from "@/lib/roles";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaffSession();

  const notifs = await db.query.notifications.findMany({
    where: eq(notificationsTable.userId, session.userId),
    orderBy: [desc(notificationsTable.createdAt)],
    limit: 20,
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar role={session.role as never} nom={session.nom} prenom={session.prenom} />
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-navy-100 bg-white px-6">
          <div>
            <p className="text-xs text-navy-400">PromoPro</p>
            <p className="text-sm font-medium text-navy-900">{ROLE_LABELS[session.role as never]}</p>
          </div>
          <NotificationBell notifications={notifs} />
        </header>
        <main className="flex-1 bg-cream p-6">{children}</main>
      </div>
    </div>
  );
}
