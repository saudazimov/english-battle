const https = require("https");

class AiProviderError extends Error {
  constructor(message, { code = "AI_PROVIDER_ERROR", status = null, retryable = false } = {}) {
    super(message);
    this.name = "AiProviderError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function nonNegativeInteger(value, fallback, maximum = 10) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, maximum) : fallback;
}

function nonNegativeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function defaultTransport({ hostname, path, headers, body, timeoutMs, signal }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener("abort", abortRequest);
      callback(value);
    };
    const req = https.request({ hostname, path, method: "POST", headers }, (res) => {
      let responseBody = "";
      res.on("data", (chunk) => { responseBody += chunk; });
      res.on("end", () => finish(resolve, { status: res.statusCode, body: responseBody }));
    });
    const abortRequest = () => req.destroy(new AiProviderError("AI so‘rovi bekor qilindi", {
      code: "AI_ABORTED",
    }));
    req.on("error", (error) => finish(reject, error));
    req.setTimeout(timeoutMs, () => req.destroy(new AiProviderError(
      `AI timeout (${timeoutMs} ms)`, { code: "AI_TIMEOUT", retryable: true }
    )));
    if (signal) {
      if (signal.aborted) return abortRequest();
      signal.addEventListener("abort", abortRequest, { once: true });
    }
    req.write(body);
    req.end();
  });
}

function providerConfiguration(environment) {
  const provider = String(environment.AI_PROVIDER || "openai").toLowerCase();
  const openai = provider === "openai";
  return {
    enabled: environment.AI_REPORTS_ENABLED !== "false",
    provider,
    apiKey: openai ? environment.OPENAI_API_KEY || "" : environment.ANTHROPIC_API_KEY || "",
    model: openai
      ? environment.OPENAI_MODEL || "gpt-4o-mini"
      : environment.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022",
    fallbackModel: openai
      ? environment.OPENAI_FALLBACK_MODEL || environment.AI_FALLBACK_MODEL || ""
      : environment.ANTHROPIC_FALLBACK_MODEL || environment.AI_FALLBACK_MODEL || "",
    timeoutMs: positiveInteger(environment.AI_REQUEST_TIMEOUT_MS, 30000, 300000),
    retries: nonNegativeInteger(environment.AI_PROVIDER_RETRIES, 2),
    maxOutputTokens: positiveInteger(environment.AI_MAX_OUTPUT_TOKENS, 4000, 16000),
    retryBaseMs: positiveInteger(environment.AI_RETRY_BASE_MS, 500, 30000),
    inputCostPerMillion: nonNegativeNumber(environment.AI_INPUT_COST_PER_MILLION),
    outputCostPerMillion: nonNegativeNumber(environment.AI_OUTPUT_COST_PER_MILLION),
  };
}

function requestDefinition(config, model, systemPrompt, userContent, maxTokens) {
  if (config.provider === "anthropic") {
    const body = JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });
    return {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(body),
      },
      body,
    };
  }
  const body = JSON.stringify({
    model,
    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userContent }],
    temperature: 0.4,
    response_format: { type: "json_object" },
    max_tokens: maxTokens,
  });
  return {
    hostname: "api.openai.com",
    path: "/v1/chat/completions",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Length": Buffer.byteLength(body),
    },
    body,
  };
}

function parseResponse(config, response, model) {
  if (response.status !== 200) {
    throw new AiProviderError(`${config.provider} status ${response.status}`, {
      code: "AI_HTTP_ERROR",
      status: response.status,
      retryable: response.status === 408 || response.status === 429 || response.status >= 500,
    });
  }
  let data;
  try {
    data = JSON.parse(response.body);
  } catch (error) {
    throw new AiProviderError("AI provider noto‘g‘ri JSON qaytardi", {
      code: "AI_RESPONSE_JSON_INVALID",
      retryable: true,
    });
  }
  const text = config.provider === "anthropic"
    ? data.content && data.content[0] && data.content[0].text
    : data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text) throw new AiProviderError("AI provider bo‘sh javob qaytardi", {
    code: "AI_EMPTY_RESPONSE",
    retryable: true,
  });
  const usage = config.provider === "anthropic"
    ? data.usage && { input: data.usage.input_tokens, output: data.usage.output_tokens }
    : data.usage && { input: data.usage.prompt_tokens, output: data.usage.completion_tokens };
  return { text, usage: usage || null, model, provider: config.provider };
}

function createAiProviderService({
  environment = process.env,
  transport = defaultTransport,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  logger = console,
} = {}) {
  const config = providerConfiguration(environment);

  function isAvailable() {
    return config.enabled && ["openai", "anthropic"].includes(config.provider) && Boolean(config.apiKey);
  }

  function publicConfig() {
    const { apiKey, ...safe } = config;
    return { ...safe, configured: Boolean(apiKey) };
  }

  function estimatedCost(usage) {
    if (!usage) return null;
    return Number((Number(usage.input || 0) * config.inputCostPerMillion / 1000000
      + Number(usage.output || 0) * config.outputCostPerMillion / 1000000).toFixed(8));
  }

  async function requestModel({ model, systemPrompt, userContent, maxTokens, signal }) {
    const definition = requestDefinition(config, model, systemPrompt, userContent, maxTokens);
    const response = await transport({ ...definition, timeoutMs: config.timeoutMs, signal });
    return parseResponse(config, response, model);
  }

  async function generateText({
    systemPrompt,
    userContent,
    maxTokens = 1500,
    promptVersion = "unversioned",
    schemaVersion = "unversioned",
    signal,
  }) {
    if (!isAvailable()) throw new AiProviderError("AI provider o‘chirilgan yoki sozlanmagan", {
      code: "AI_DISABLED",
    });
    const boundedTokens = Math.min(positiveInteger(maxTokens, 1500), config.maxOutputTokens);
    const models = [...new Set([config.model, config.fallbackModel].filter(Boolean))];
    let lastError;
    for (const model of models) {
      for (let attempt = 1; attempt <= config.retries + 1; attempt++) {
        if (signal && signal.aborted) throw new AiProviderError("AI so‘rovi bekor qilindi", {
          code: "AI_ABORTED",
        });
        const startedAt = Date.now();
        try {
          const result = await requestModel({ model, systemPrompt, userContent, maxTokens: boundedTokens, signal });
          const metadata = {
            prompt_version: promptVersion,
            schema_version: schemaVersion,
            attempt,
            latency_ms: Date.now() - startedAt,
            estimated_cost_usd: estimatedCost(result.usage),
          };
          if (typeof logger.info === "function") {
            try {
              logger.info("[AI provider usage]", {
                provider: result.provider, model: result.model, usage: result.usage, ...metadata,
              });
            } catch (loggingError) {
              console.error("[AI provider usage log xatosi]", loggingError.message);
            }
          }
          return { ...result, metadata };
        } catch (error) {
          lastError = error;
          const retryable = error.retryable === true || ["AI_TIMEOUT", "ECONNRESET", "ETIMEDOUT"].includes(error.code);
          if (!retryable || attempt > config.retries || (signal && signal.aborted)) break;
          await sleep(config.retryBaseMs * (2 ** (attempt - 1)));
        }
      }
    }
    throw lastError || new AiProviderError("AI provider javob bermadi");
  }

  return { isAvailable, getConfig: publicConfig, generateText };
}

module.exports = {
  AiProviderError,
  defaultTransport,
  providerConfiguration,
  createAiProviderService,
};
