import { z } from "zod";
import { cleanJsonOutput, parseJsonWithRepair } from "../lib/ai/ollama";
import {
  isSlotAvailable,
  recordSlotFailure,
  recordSlotSuccess,
  getSlotStatus,
} from "../lib/ai/circuit-breaker";

export async function runAITests(assert: (condition: boolean, name: string) => void) {
  console.log("\n--- 3. AI Routing & JSON Schema Validation Tests ---");

  // 1. JSON markdown block stripping
  const rawWithMarkdown = "```json\n{\n  \"course\": \"Hukum Tata Negara\",\n  \"credits\": 3\n}\n```";
  const cleaned = cleanJsonOutput(rawWithMarkdown);
  assert(
    cleaned.startsWith("{") && cleaned.endsWith("}"),
    "Markdown code fences stripped cleanly from AI JSON response"
  );

  // 2. Trailing comma recovery
  const brokenTrailingComma = '{"items": ["pacta sunt servanda", "asas legalitas",], "count": 2}';
  const repaired = parseJsonWithRepair(brokenTrailingComma);
  assert(
    repaired && repaired.items?.length === 2 && repaired.count === 2,
    "JSON parser tolerates and repairs trailing commas"
  );

  // 3. Strict Zod schema validation
  const testSchema = z.object({
    title: z.string().min(1),
    priority: z.enum(["low", "medium", "high"]),
    estimatedMinutes: z.number().int().positive(),
  });

  const validData = { title: "Analisis Putusan MK", priority: "high", estimatedMinutes: 120 };
  const validParsed = testSchema.safeParse(validData);
  assert(validParsed.success === true, "Conforming payload passes Zod validation");

  const invalidData = { title: "Analisis Putusan MK", priority: "INVALID_PRIORITY", estimatedMinutes: -10 };
  const invalidParsed = testSchema.safeParse(invalidData);
  assert(invalidParsed.success === false, "Non-conforming payload fails Zod validation (fail-closed)");

  // 4. Circuit Breaker Slot Health Transitions
  recordSlotSuccess("groq", 1);
  assert(isSlotAvailable("groq", 1) === true, "Healthy slot is available");

  // 3 consecutive 500 failures should trigger circuit breaker cooldown
  recordSlotFailure("groq", 2, { status: 500, reason: "Server overloaded" });
  recordSlotFailure("groq", 2, { status: 500, reason: "Server overloaded" });
  recordSlotFailure("groq", 2, { status: 500, reason: "Server overloaded" });

  assert(isSlotAvailable("groq", 2) === false, "Slot enters COOLDOWN after 3 consecutive failures");
  const slotStatus = getSlotStatus();
  assert(slotStatus["groq:2"]?.state === "COOLDOWN", "Circuit breaker records slot state as COOLDOWN");

  // Recovery upon success
  recordSlotSuccess("groq", 2);
  assert(isSlotAvailable("groq", 2) === true, "Slot recovers to HEALTHY upon success");
}
