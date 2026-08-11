import { AICallOptions, AIResult, AIAccountSlot } from "./types";
import { isSlotAvailable, recordSlotSuccess, recordSlotFailure } from "./circuit-breaker";
import { logAIUsage } from "./usage";
import { logger } from "../logger";

let ollamaTurnSlot: AIAccountSlot = 1;
let resolvedOllamaModel: string | null = null;
let lastModelCheckTime = 0;
const MODEL_CACHE_TTL_MS = 60 * 60 * 1000; // Cache resolved model for 1 hour

/**
 * Safely strips markdown code blocks (e.g. ```json ... ```) from model output
 */
export function cleanJsonOutput(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

/**
 * Parses JSON with common AI format tolerance (strip markdown, handle trailing commas)
 */
export function parseJsonWithRepair(raw: string): any {
  const cleaned = cleanJsonOutput(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    // Attempt trailing comma fix
    try {
      const fixed = cleaned.replace(/,\s*([\]}])/g, "$1");
      return JSON.parse(fixed);
    } catch {
      return null;
    }
  }
}

/**
 * Resolves configured model name against available tags on Ollama Cloud API
 */
export async function resolveOllamaModel(apiKey: string): Promise<string> {
  const now = Date.now();
  if (resolvedOllamaModel && now - lastModelCheckTime < MODEL_CACHE_TTL_MS) {
    return resolvedOllamaModel;
  }

  const configured = process.env.OLLAMA_MODEL || "gpt-oss:120b-cloud";
  try {
    const res = await fetch("https://ollama.com/api/tags", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      const data = await res.json();
      const models: string[] = data.models?.map((m: any) => m.name) || [];

      if (models.includes(configured)) {
        resolvedOllamaModel = configured;
        lastModelCheckTime = now;
        return configured;
      }

      // Check without :cloud suffix or with alternative tags
      const baseName = configured.replace(/:cloud$/, "");
      const matched = models.find((m) => m === baseName || m.startsWith(baseName));
      if (matched) {
        resolvedOllamaModel = matched;
        lastModelCheckTime = now;
        return matched;
      }
    }
  } catch (err) {
    logger.warn("Failed to resolve Ollama tags dynamically, using configured model:", err);
  }

  resolvedOllamaModel = configured;
  lastModelCheckTime = now;
  return configured;
}

export function getNextOllamaSlot(): AIAccountSlot | null {
  const key1 = process.env.OLLAMA_API_KEY_1;
  const key2 = process.env.OLLAMA_API_KEY_2;

  if (!key1 && !key2) return null;

  const preferred = ollamaTurnSlot;
  ollamaTurnSlot = preferred === 1 ? 2 : 1;

  const keyForPreferred = preferred === 1 ? key1 : key2;
  if (keyForPreferred && isSlotAvailable("ollama", preferred)) {
    return preferred;
  }

  const alternate: AIAccountSlot = preferred === 1 ? 2 : 1;
  const keyForAlternate = alternate === 1 ? key1 : key2;
  if (keyForAlternate && isSlotAvailable("ollama", alternate)) {
    return alternate;
  }

  return null;
}

export async function callOllama(
  slot: AIAccountSlot,
  options: AICallOptions,
  modelOverride?: string
): Promise<AIResult> {
  const apiKey = slot === 1 ? process.env.OLLAMA_API_KEY_1 : process.env.OLLAMA_API_KEY_2;
  const startTime = Date.now();

  if (!apiKey) {
    return {
      success: false,
      text: "",
      provider: "ollama",
      accountSlot: slot,
      model: modelOverride || "unknown",
      latencyMs: 0,
      error: "Ollama API key not configured for slot " + slot,
    };
  }

  const model = modelOverride || (await resolveOllamaModel(apiKey));
  const timeoutMs = options.timeoutMs || 35000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let systemPrompt = options.systemPrompt || "";
    let userPrompt = options.prompt;

    if (options.responseSchema) {
      systemPrompt +=
        "\nIMPORTANT: You must respond ONLY with a raw, valid JSON object matching the requested schema. Do not include introductory or concluding conversational text. No explanations outside JSON.";
    }

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: userPrompt });

    const response = await fetch("https://ollama.com/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.2,
          num_predict: options.maxTokens ?? 2048,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      recordSlotFailure("ollama", slot, {
        status: response.status,
        reason: errorText || response.statusText,
      });

      await logAIUsage({
        userId: options.userId,
        provider: "ollama",
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
        provider: "ollama",
        accountSlot: slot,
        model,
        latencyMs,
        error: `Ollama error (${response.status}): ${errorText}`,
      };
    }

    const json = await response.json();
    const content = json.message?.content || "";

    recordSlotSuccess("ollama", slot);

    let parsedData: any = undefined;
    if (options.responseSchema) {
      const cleaned = cleanJsonOutput(content);
      let parseOk = false;

      try {
        const rawObj = parseJsonWithRepair(cleaned);
        if (rawObj) {
          const parsed = options.responseSchema.safeParse(rawObj);
          if (parsed.success) {
            parsedData = parsed.data;
            parseOk = true;
          } else {
            logger.warn("Ollama JSON schema validation failed on initial attempt:", parsed.error.format());
          }
        }
      } catch (err) {
        logger.warn("Failed to parse Ollama JSON:", err);
      }

      // If initial validation failed and we haven't attempted repair yet, run exactly ONE repair
      if (!parseOk && !options.isRepair) {
        logger.info("Attempting single Ollama JSON schema repair...");
        const repairRes = await callOllama(
          slot,
          {
            ...options,
            isRepair: true,
            prompt: `The following JSON did not conform to the schema: ${cleaned}. Please return strictly corrected raw JSON matching the schema:`,
            systemPrompt: "You are a JSON schema repair assistant. Return only valid corrected JSON without markdown wrappers.",
            timeoutMs: 15000,
          },
          model
        );

        if (repairRes.success && repairRes.text) {
          const repairedCleaned = cleanJsonOutput(repairRes.text);
          try {
            const repairedObj = parseJsonWithRepair(repairedCleaned);
            if (repairedObj) {
              const secondParse = options.responseSchema.safeParse(repairedObj);
              if (secondParse.success) {
                parsedData = secondParse.data;
                parseOk = true;
              }
            }
          } catch (repairErr) {
            logger.warn("Ollama schema repair output could not be parsed:", repairErr);
          }
        }
      }

      if (!parseOk) {
        return {
          success: false,
          text: content,
          provider: "ollama",
          accountSlot: slot,
          model,
          latencyMs,
          error: "Ollama response failed structured JSON schema validation.",
        };
      }
    }

    await logAIUsage({
      userId: options.userId,
      provider: "ollama",
      accountSlot: slot,
      model,
      requestType: options.requestType,
      status: "SUCCESS",
      httpStatus: 200,
      inputTokens: json.prompt_eval_count,
      outputTokens: json.eval_count,
      latencyMs,
    });

    return {
      success: true,
      text: content,
      data: parsedData,
      provider: "ollama",
      accountSlot: slot,
      model,
      latencyMs,
      inputTokens: json.prompt_eval_count,
      outputTokens: json.eval_count,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    const isTimeout = err.name === "AbortError";
    const errorMsg = isTimeout ? "Request timed out" : err.message || "Unknown error";

    recordSlotFailure("ollama", slot, {
      status: isTimeout ? 408 : 500,
      reason: errorMsg,
    });

    await logAIUsage({
      userId: options.userId,
      provider: "ollama",
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
      provider: "ollama",
      accountSlot: slot,
      model,
      latencyMs,
      error: errorMsg,
    };
  }
}
