import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db, pushSubscriptions } from "../db";
import { logger } from "../logger";

let vapidConfigured = false;

export function configureWebPush(): boolean {
  if (vapidConfigured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@forfh.id";

  if (publicKey && privateKey) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
    return true;
  }
  return false;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: {
    url?: string;
    entityType?: string;
    entityId?: string;
  };
}

/**
 * Sends a Web Push notification to all active subscriptions for a given user
 */
export async function sendPushToUser(
  userId: string,
  payload: PushNotificationPayload
): Promise<{ sentCount: number; failedCount: number }> {
  const configured = configureWebPush();
  if (!configured) {
    logger.warn("VAPID keys not configured, skipping push notification dispatch.");
    return { sentCount: 0, failedCount: 0 };
  }

  const subscriptions = await db.query.pushSubscriptions.findMany({
    where: eq(pushSubscriptions.userId, userId),
  });

  if (subscriptions.length === 0) {
    return { sentCount: 0, failedCount: 0 };
  }

  const stringifiedPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/icons/icon-192.png",
    badge: payload.badge || "/icons/badge-72.png",
    data: payload.data || {},
  });

  let sentCount = 0;
  let failedCount = 0;

  for (const sub of subscriptions) {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    };

    try {
      await webpush.sendNotification(pushSubscription, stringifiedPayload);
      sentCount += 1;
      await db
        .update(pushSubscriptions)
        .set({ lastUsedAt: new Date() })
        .where(eq(pushSubscriptions.id, sub.id));
    } catch (err: any) {
      failedCount += 1;
      // If subscription expired or was invalidated (404 Not Found or 410 Gone), delete it cleanly
      if (err.statusCode === 404 || err.statusCode === 410) {
        logger.info(`Pruning expired push subscription ${sub.id}`);
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      } else {
        logger.error("Web Push delivery error:", err?.message || "Delivery failure");
      }
    }
  }

  return { sentCount, failedCount };
}
