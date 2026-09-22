"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { notifications } from "@/db/schema";
import { requireStaffSession } from "@/lib/session";

export async function markNotificationRead(notificationId: string) {
  const session = await requireStaffSession();
  await db
    .update(notifications)
    .set({ lu: true })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, session.userId)));
  revalidatePath("/dashboard");
}

export async function markAllNotificationsRead() {
  const session = await requireStaffSession();
  await db.update(notifications).set({ lu: true }).where(eq(notifications.userId, session.userId));
  revalidatePath("/dashboard");
}
