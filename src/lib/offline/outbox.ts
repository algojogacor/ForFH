import { getLocalDB } from "./idb";

export interface OutboxItem {
  id: string;
  userId?: string;
  endpoint: string;
  method: "POST" | "PUT" | "DELETE" | "PATCH";
  body: any;
  timestamp: number;
}

/**
 * Enqueue a mutation when the client is offline
 */
export async function queueOfflineMutation(
  endpoint: string,
  method: "POST" | "PUT" | "DELETE" | "PATCH",
  body: any,
  userId: string = "anonymous"
): Promise<string> {
  const db = await getLocalDB(userId);
  if (!db) return "";

  const id = crypto.randomUUID();
  await db.put("outbox", {
    id,
    userId,
    endpoint,
    method,
    body,
    timestamp: Date.now(),
  });

  return id;
}

/**
 * Synchronize all pending outbox mutations with the server
 */
export async function processOutboxSync(): Promise<{
  syncedCount: number;
  failedCount: number;
}> {
  if (typeof window === "undefined" || !navigator.onLine) {
    return { syncedCount: 0, failedCount: 0 };
  }

  const db = await getLocalDB();
  if (!db) return { syncedCount: 0, failedCount: 0 };

  const pendingItems = await db.getAllFromIndex("outbox", "by-timestamp");
  if (pendingItems.length === 0) {
    return { syncedCount: 0, failedCount: 0 };
  }

  let syncedCount = 0;
  let failedCount = 0;

  for (const item of pendingItems) {
    try {
      const res = await fetch(item.endpoint, {
        method: item.method,
        headers: { "Content-Type": "application/json" },
        body: item.body ? JSON.stringify(item.body) : undefined,
      });

      if (res.ok) {
        await db.delete("outbox", item.id);
        syncedCount += 1;
      } else {
        failedCount += 1;
      }
    } catch (err) {
      console.warn("Outbox sync failed for item:", item.id, err);
      failedCount += 1;
      break; // Stop on network disconnect
    }
  }

  return { syncedCount, failedCount };
}

/**
 * Initialize window listeners for online events and focus events to auto-sync
 */
export function initAutoSyncListener() {
  if (typeof window === "undefined") return;

  window.addEventListener("online", () => {
    processOutboxSync();
  });

  window.addEventListener("focus", () => {
    processOutboxSync();
  });
}
