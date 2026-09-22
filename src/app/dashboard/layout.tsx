import { desc, eq } from "drizzle-orm";
import { requireStaffSession } from "@/lib/session";
import { db } from "@/db/client";
import { notifications as notificationsTable } from "@/db/schema";
import { DashboardShell } from "@/components/layout/DashboardShell";
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
    <DashboardShell
      role={session.role as never}
      nom={session.nom}
      prenom={session.prenom}
      roleLabel={ROLE_LABELS[session.role as never]}
      bell={<NotificationBell notifications={notifs} />}
    >
      {children}
    </DashboardShell>
  );
}
