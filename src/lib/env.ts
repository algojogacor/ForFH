import { z } from "zod";
import { logger } from "./logger";

const isProduction = process.env.NODE_ENV === "production";
const isBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.npm_lifecycle_event === "build";

// 1. Server Environment Schema
const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    // Database (Turso in production, local SQLite only in dev/test)
    TURSO_DATABASE_URL: z.string().default("file:forfh-local.db"),
    TURSO_AUTH_TOKEN: z.string().optional(),

    // WhatsApp Bot (Baileys) — dipakai route pairing & OTP
    WA_BOT_PHONE: z.string().optional(), // E.164 tanpa "+" (requestPairingCode)
    WA_ADMIN_PHONE: z.string().optional(), // E.164 — pemilik bot

    // AI Providers (Optional integrations - fail gracefully per integration)
    GROQ_API_KEY_1: z.string().optional(),
    GROQ_API_KEY_2: z.string().optional(),
    GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),

    OLLAMA_API_KEY_1: z.string().optional(),
    OLLAMA_API_KEY_2: z.string().optional(),
    OLLAMA_MODEL: z.string().default("gpt-oss:120b-cloud"),
    OLLAMA_LAST_RESORT_MODEL: z.string().default("minimax-m3:cloud"),

    // Pasal.id Legal API
    PASAL_API_BASE_URL: z.string().default("https://pasal.id/api/v1"),
    PASAL_API_TOKEN: z.string().optional(),

    // QStash Webhooks
    QSTASH_URL: z.string().optional(),
    QSTASH_TOKEN: z.string().optional(),
    QSTASH_CURRENT_SIGNING_KEY: z.string().optional(),
    QSTASH_NEXT_SIGNING_KEY: z.string().optional(),

    // Google Drive Storage
    GOOGLE_DRIVE_CLIENT_ID: z.string().optional(),
    GOOGLE_DRIVE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_DRIVE_REFRESH_TOKEN: z.string().optional(),
    GOOGLE_DRIVE_ROOT_FOLDER_ID: z.string().optional(),
    DEFAULT_USER_STORAGE_QUOTA_MB: z.coerce.number().default(250),

    // Web Push (VAPID)
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().default("mailto:admin@forfh.id"),
  })
  .superRefine((data, ctx) => {
    // Only enforce strict production remote Turso constraints at runtime (not during local next build)
    if (data.NODE_ENV === "production" && !isBuildPhase) {
      if (data.TURSO_DATABASE_URL.startsWith("file:")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["TURSO_DATABASE_URL"],
          message:
            "Local SQLite file databases ('file:') are strictly forbidden in production runtime. Use a remote Turso database URL.",
        });
      }
      if (!data.TURSO_AUTH_TOKEN && !data.TURSO_DATABASE_URL.startsWith("http://127.0.0.1")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["TURSO_AUTH_TOKEN"],
          message: "TURSO_AUTH_TOKEN is required in production when connecting to a remote Turso database.",
        });
      }
    }
  });

// 2. Client-safe Public Environment Schema
const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;

function validateServerEnv(): ServerEnv {
  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    logger.error("Invalid server environment configuration:", result.error.format());
    if (isProduction && !isBuildPhase) {
      throw new Error(
        `CRITICAL: Server configuration error in production: ${JSON.stringify(result.error.format())}`
      );
    }
    // Fall back to parsed defaults
    return serverEnvSchema.parse({ NODE_ENV: process.env.NODE_ENV || "development" });
  }
  return result.data;
}

function validateClientEnv(): ClientEnv {
  return clientEnvSchema.parse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  });
}

export const serverEnv = validateServerEnv();
export const clientEnv = validateClientEnv();
