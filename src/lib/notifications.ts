import { db } from "@/db/client";
import { notifications } from "@/db/schema";

export async function notify(params: {
  userId: string;
  type: string;
  titre: string;
  message?: string;
  lien?: string;
}) {
  await db.insert(notifications).values({
    userId: params.userId,
    type: params.type,
    titre: params.titre,
    message: params.message,
    lien: params.lien,
  });
}

export async function notifyMany(
  userIds: string[],
  params: { type: string; titre: string; message?: string; lien?: string },
) {
  await Promise.all(userIds.map((userId) => notify({ userId, ...params })));
}
