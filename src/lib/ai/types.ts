import { z } from "zod";

export type AIProviderName = "groq" | "ollama";
export type AIAccountSlot = 1 | 2;

export interface AICallOptions {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  responseSchema?: z.ZodType<any>;
  schemaName?: string;
  requestType:
    | "task_parse"
    | "breakdown"
    | "smart_deadline"
    | "legal_explain"
    | "daily_insight"
    | "summary"
    | "study_assistant";
  userId?: string;
  isRepair?: boolean;
}

export interface AIResult<T = any> {
  success: boolean;
  text: string;
  data?: T;
  provider: AIProviderName;
  accountSlot: AIAccountSlot;
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
  fallbackUsed?: boolean;
}

export interface SlotHealth {
  state: "HEALTHY" | "COOLDOWN";
  cooldownUntil: number;
  failureCount: number;
  lastFailureReason?: string;
}
