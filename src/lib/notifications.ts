import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { notifications, users, type Role } from "@/db/schema";

type NotifParams = { type: string; titre: string; message?: string; lien?: string };

/** Notifie un utilisateur interne. */
export async function notify(params: NotifParams & { userId: string }) {
  await db.insert(notifications).values({
    recipientType: "STAFF",
    userId: params.userId,
    type: params.type,
    titre: params.titre,
    message: params.message,
    lien: params.lien,
  });
}

/** Notifie un client (visible dans la cloche de son espace). */
export async function notifyClient(params: NotifParams & { clientId: string }) {
  await db.insert(notifications).values({
    recipientType: "CLIENT",
    clientId: params.clientId,
    type: params.type,
    titre: params.titre,
    message: params.message,
    lien: params.lien,
  });
}

export async function notifyMany(userIds: string[], params: NotifParams) {
  await Promise.all(userIds.map((userId) => notify({ userId, ...params })));
}

/** Notifie tous les utilisateurs actifs d'un rôle donné chez un promoteur. */
export async function notifyRole(promoteurId: string, role: Role | Role[], params: NotifParams) {
  const roles = Array.isArray(role) ? role : [role];
  const list = await db.query.users.findMany({
    where: and(eq(users.promoteurId, promoteurId), eq(users.actif, true), isNull(users.deletedAt)),
  });
  const ids = list.filter((u) => roles.includes(u.role)).map((u) => u.id);
  await notifyMany(ids, params);
  return ids;
}
