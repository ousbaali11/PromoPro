"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { notifications } from "@/db/schema";
import { getSession } from "@/lib/session";

/** Condition "mes notifications" selon le type de session (staff ou client). */
async function ownerCondition() {
  const session = await getSession();
  if (!session) return null;
  return session.kind === "staff"
    ? and(eq(notifications.recipientType, "STAFF"), eq(notifications.userId, session.userId))
    : and(eq(notifications.recipientType, "CLIENT"), eq(notifications.clientId, session.clientId));
}

export async function markNotificationRead(notificationId: string) {
  const mine = await ownerCondition();
  if (!mine) return;
  await db
    .update(notifications)
    .set({ lu: true })
    .where(and(eq(notifications.id, notificationId), mine));
  revalidatePath("/dashboard");
  revalidatePath("/client");
}

export async function markAllNotificationsRead() {
  const mine = await ownerCondition();
  if (!mine) return;
  await db.update(notifications).set({ lu: true }).where(mine);
  revalidatePath("/dashboard");
  revalidatePath("/client");
}
