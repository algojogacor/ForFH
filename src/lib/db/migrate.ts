import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "./index";
import { logger } from "../logger";

export async function runMigrations() {
  logger.info("Running pending database migrations against Turso / LibSQL...");
  try {
    await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
    logger.info("Database migrations applied successfully.");
  } catch (error) {
    logger.error("Failed to run database migrations:", error);
    process.exit(1);
  }
}

if (require.main === module || process.argv[1]?.includes("migrate.ts")) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error("Migration error:", err);
      process.exit(1);
    });
}
