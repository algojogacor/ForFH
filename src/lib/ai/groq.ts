import { AICallOptions, AIResult, AIAccountSlot } from "./types";
import { isSlotAvailable, recordSlotSuccess, recordSlotFailure } from "./circuit-breaker";
import { logAIUsage } from "./usage";
import { cleanJsonOutput } from "./ollama";
import { logger } from "../logger";

let groqTurnSlot: AIAccountSlot = 1;

export function getNextGroqSlot(): AIAccountSlot | null {
  const key1 = process.env.GROQ_API_KEY_1;
  const key2 = process.env.GROQ_API_KEY_2;

  if (!key1 && !key2) return null;

  // Try current round-robin turn if available
  const preferred = groqTurnSlot;
  groqTurnSlot = preferred === 1 ? 2 : 1;

  const keyForPreferred = preferred === 1 ? key1 : key2;
  if (keyForPreferred && isSlotAvailable("groq", preferred)) {
    return preferred;
  }

  // Try alternate slot
  const alternate: AIAccountSlot = preferred === 1 ? 2 : 1;
  const keyForAlternate = alternate === 1 ? key1 : key2;
  if (keyForAlternate && isSlotAvailable("groq", alternate)) {
    return alternate;
  }

  return null;
}

export async function callGroq(
  slot: AIAccountSlot,
  options: AICallOptions
): Promise<AIResult> {
  const apiKey = slot === 1 ? process.env.GROQ_API_KEY_1 : process.env.GROQ_API_KEY_2;
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  const startTime = Date.now();

  if (!apiKey) {
    return {
      success: false,
      text: "",
      provider: "groq",
      accountSlot: slot,
      model,
      latencyMs: 0,
      error: "Groq API key not configured for slot " + slot,
    };
  }

  const timeoutMs = options.timeoutMs || 25000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const messages: Array<{ role: string; content: string }> = [];
    let systemPrompt = options.systemPrompt || "";
    if (options.responseSchema) {
      systemPrompt +=
        "\nIMPORTANT: Respond with a valid raw JSON object matching the schema. No markdown wrappers or extra commentary.";
    }

    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: options.prompt });

    const requestBody: Record<string, any> = {
      model,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 2048,
    };

    if (options.responseSchema) {
      requestBody.response_format = { type: "json_object" };
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;

      recordSlotFailure("groq", slot, {
        status: response.status,
        retryAfterSeconds,
        reason: errorText || response.statusText,
      });

      await logAIUsage({
        userId: options.userId,
        provider: "groq",
        accountSlot: slot,
        model,
        requestType: options.requestType,
        status: "FAILURE",
        httpStatus: response.status,
        latencyMs,
        errorClass: `HTTP_${response.status}`,
      });

      return {
        success: false,
        text: "",
        provider: "groq",
        accountSlot: slot,
        model,
        latencyMs,
        error: `Groq error (${response.status}): ${errorText}`,
      };
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content || "";
    const usage = json.usage;

    recordSlotSuccess("groq", slot);

    let parsedData: any = undefined;
    if (options.responseSchema) {
      const cleaned = cleanJsonOutput(content);
      let parseOk = false;
      try {
        const rawJson = JSON.parse(cleaned);
        const parsed = options.responseSchema.safeParse(rawJson);
        if (parsed.success) {
          parsedData = parsed.data;
          parseOk = true;
        } else {
          logger.warn("Groq JSON schema validation failed on initial attempt:", parsed.error.format());
        }
      } catch (err) {
        logger.warn("Groq raw response was not valid JSON:", content);
      }

      // If initial validation failed and we haven't attempted repair yet, run exactly ONE repair
      if (!parseOk && !options.isRepair) {
        logger.info("Attempting single Groq JSON schema repair...");
        const repairResult = await callGroq(slot, {
          ...options,
          isRepair: true,
          prompt: `The previous response failed schema validation. Output was:\n${cleaned}\n\nPlease correct the JSON format strictly according to the required schema and return ONLY valid JSON:`,
          systemPrompt: "You are a JSON schema repair assistant. Output ONLY valid corrected JSON object.",
          timeoutMs: 15000,
        });

        if (repairResult.success && repairResult.text) {
          const repairedCleaned = cleanJsonOutput(repairResult.text);
          try {
            const secondParse = options.responseSchema.safeParse(JSON.parse(repairedCleaned));
            if (secondParse.success) {
              parsedData = secondParse.data;
              parseOk = true;
            }
          } catch (repairErr) {
            logger.warn("Groq schema repair output could not be parsed:", repairErr);
          }
        }
      }

      if (!parseOk) {
        return {
          success: false,
          text: content,
          provider: "groq",
          accountSlot: slot,
          model,
          latencyMs,
          error: "Groq response failed structured JSON schema validation.",
        };
      }
    }

    await logAIUsage({
      userId: options.userId,
      provider: "groq",
      accountSlot: slot,
      model,
      requestType: options.requestType,
      status: "SUCCESS",
      httpStatus: 200,
      inputTokens: usage?.prompt_tokens,
      outputTokens: usage?.completion_tokens,
      latencyMs,
    });

    return {
      success: true,
      text: content,
      data: parsedData,
      provider: "groq",
      accountSlot: slot,
      model,
      latencyMs,
      inputTokens: usage?.prompt_tokens,
      outputTokens: usage?.completion_tokens,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    const isTimeout = err.name === "AbortError";
    const errorMsg = isTimeout ? "Request timed out" : err.message || "Unknown error";

    recordSlotFailure("groq", slot, {
      status: isTimeout ? 408 : 500,
      reason: errorMsg,
    });

    await logAIUsage({
      userId: options.userId,
      provider: "groq",
      accountSlot: slot,
      model,
      requestType: options.requestType,
      status: "FAILURE",
      latencyMs,
      errorClass: isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
    });

    return {
      success: false,
      text: "",
      provider: "groq",
      accountSlot: slot,
      model,
      latencyMs,
      error: errorMsg,
    };
  }
}
