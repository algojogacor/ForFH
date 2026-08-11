import crypto from "crypto";
import { db, aiUsage } from "../db";
import { AIProviderName, AIAccountSlot } from "./types";
import { logger } from "../logger";

export async function logAIUsage(data: {
  userId?: string;
  provider: AIProviderName;
  accountSlot: AIAccountSlot;
  model: string;
  requestType: string;
  status: "SUCCESS" | "FAILURE";
  httpStatus?: number;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  errorClass?: string;
}): Promise<void> {
  try {
    await db.insert(aiUsage).values({
      id: crypto.randomUUID(),
      userId: data.userId || null,
      provider: data.provider,
      accountSlot: data.accountSlot,
      model: data.model,
      requestType: data.requestType,
      status: data.status,
      httpStatus: data.httpStatus || null,
      inputTokens: data.inputTokens || null,
      outputTokens: data.outputTokens || null,
      latencyMs: data.latencyMs || null,
      errorClass: data.errorClass || null,
    });
  } catch (error) {
    logger.error("Failed to log AI usage:", error);
  }
}
