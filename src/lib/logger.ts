/**
 * Production Secret Redaction and Safe Logging Utility
 */

const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /pepper/i,
  /key/i,
  /auth/i,
  /credential/i,
  /bearer/i,
  /cookie/i,
];

export function redactSensitiveString(str: unknown): string {
  // Baileys (pino-style) memanggil logger.error({error, ...}, 'msg') — arg
  // pertama bisa objek non-string. Jangan crash: koersi ke teks yang informatif.
  if (typeof str !== "string") {
    if (str instanceof Error) return str.stack ?? `${str.name}: ${str.message}`;
    if (str === null || str === undefined) return String(str);
    try {
      return JSON.stringify(str);
    } catch {
      return String(str);
    }
  }
  if (!str) return str;
  return str
    .replace(/(Bearer\s+)[A-Za-z0-9_\-\.]+/gi, "$1[REDACTED]")
    .replace(/(gsk_[A-Za-z0-9_]+)/gi, "[REDACTED_GROQ_KEY]")
    .replace(/(pasal_[A-Za-z0-9_]+)/gi, "[REDACTED_PASAL_KEY]")
    .replace(/(GOCSPX-[A-Za-z0-9_\-]+)/gi, "[REDACTED_GOOGLE_SECRET]")
    .replace(/(libsql:\/\/[^:]+:)([^@]+)(@)/gi, "$1[REDACTED_TURSO_TOKEN]$3");
}

export function redactObject<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    return redactSensitiveString(obj) as unknown as T;
  }
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item)) as unknown as T;
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj as Record<string, any>)) {
    const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
    if (isSensitiveKey && typeof value === "string") {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = redactObject(value);
    } else if (typeof value === "string") {
      sanitized[key] = redactSensitiveString(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized as T;
}

export const logger = {
  info: (message: string, ...args: any[]) => {
    const sanitizedArgs = args.map((a) => (typeof a === "object" ? redactObject(a) : redactSensitiveString(String(a))));
    console.log(`[INFO] ${redactSensitiveString(message)}`, ...sanitizedArgs);
  },
  warn: (message: string, ...args: any[]) => {
    const sanitizedArgs = args.map((a) => (typeof a === "object" ? redactObject(a) : redactSensitiveString(String(a))));
    console.warn(`[WARN] ${redactSensitiveString(message)}`, ...sanitizedArgs);
  },
  error: (message: string, ...args: any[]) => {
    const sanitizedArgs = args.map((a) => (typeof a === "object" ? redactObject(a) : redactSensitiveString(String(a))));
    console.error(`[ERROR] ${redactSensitiveString(message)}`, ...sanitizedArgs);
  },
};
