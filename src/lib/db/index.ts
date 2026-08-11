import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const isBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.npm_lifecycle_event === "build";

const url = process.env.TURSO_DATABASE_URL || "file:forfh-local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

// Create raw LibSQL client (supports both remote Turso and local file SQLite)
export const rawClient = createClient({
  url: url,
  authToken: url.startsWith("file:") ? undefined : authToken,
});

// Create Drizzle ORM instance
export const db = drizzle(rawClient, { schema });

export type DB = typeof db;
export * from "./schema";
