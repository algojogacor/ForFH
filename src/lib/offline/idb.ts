import { openDB, DBSchema, IDBPDatabase, deleteDB } from "idb";

export interface ForFHUserDB extends DBSchema {
  courses: {
    key: string;
    value: any;
    indexes: { "by-term": string };
  };
  schedules: {
    key: string;
    value: any;
    indexes: { "by-day": number };
  };
  tasks: {
    key: string;
    value: any;
    indexes: { "by-status": string; "by-due": number };
  };
  notes: {
    key: string;
    value: any;
    indexes: { "by-updated": number };
  };
  settings: {
    key: string;
    value: any;
  };
  outbox: {
    key: string;
    value: {
      id: string;
      userId: string;
      endpoint: string;
      method: "POST" | "PUT" | "DELETE" | "PATCH";
      body: any;
      timestamp: number;
    };
    indexes: { "by-timestamp": number };
  };
}

const DB_VERSION = 2;
const dbCache = new Map<string, Promise<IDBPDatabase<ForFHUserDB>>>();

/**
 * Gets a user-isolated IndexedDB instance to prevent cross-user data leaks on shared devices
 */
export function getUserDB(userId?: string | null): Promise<IDBPDatabase<ForFHUserDB>> | null {
  if (typeof window === "undefined") {
    return null;
  }

  const safeUserId = userId?.trim() || "anonymous";
  const dbName = `forfh-user-${safeUserId}-v${DB_VERSION}`;

  if (!dbCache.has(dbName)) {
    const promise = openDB<ForFHUserDB>(dbName, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("courses")) {
          const store = db.createObjectStore("courses", { keyPath: "id" });
          store.createIndex("by-term", "academicTermId");
        }
        if (!db.objectStoreNames.contains("schedules")) {
          const store = db.createObjectStore("schedules", { keyPath: "id" });
          store.createIndex("by-day", "dayOfWeek");
        }
        if (!db.objectStoreNames.contains("tasks")) {
          const store = db.createObjectStore("tasks", { keyPath: "id" });
          store.createIndex("by-status", "status");
          store.createIndex("by-due", "dueAt");
        }
        if (!db.objectStoreNames.contains("notes")) {
          const store = db.createObjectStore("notes", { keyPath: "id" });
          store.createIndex("by-updated", "updatedAt");
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("outbox")) {
          const store = db.createObjectStore("outbox", { keyPath: "id" });
          store.createIndex("by-timestamp", "timestamp");
        }
      },
    });
    dbCache.set(dbName, promise);
  }

  return dbCache.get(dbName)!;
}

export const getLocalDB = getUserDB;

/**
 * Clears the offline database for a given user on logout
 */
export async function clearUserCache(userId?: string | null): Promise<void> {
  if (typeof window === "undefined") return;

  const safeUserId = userId?.trim() || "anonymous";
  const dbName = `forfh-user-${safeUserId}-v${DB_VERSION}`;

  try {
    if (dbCache.has(dbName)) {
      const db = await dbCache.get(dbName)!;
      db.close();
      dbCache.delete(dbName);
    }
    await deleteDB(dbName);
    // Also remove legacy global db if present
    await deleteDB("forfh-local-db").catch(() => {});
  } catch (err) {
    console.warn("Failed to delete local user IndexedDB:", err);
  }
}
