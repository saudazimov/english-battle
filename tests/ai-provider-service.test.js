const test = require("node:test");
const assert = require("node:assert/strict");

const {
  AiProviderError,
  createAiProviderService,
} = require("../src/services/aiProviderService");

function openAiResponse(text = "{\"ok\":true}", usage = { prompt_tokens: 12, completion_tokens: 8 }) {
  return {
    status: 200,
    body: JSON.stringify({ choices: [{ message: { content: text } }], usage }),
  };
}

test("AI provider stays disabled without an enabled configured provider", async () => {
  let transportCalls = 0;
  const service = createAiProviderService({
    environment: {
      AI_REPORTS_ENABLED: "false", AI_PROVIDER: "openai", OPENAI_API_KEY: "secret",
      AI_INPUT_COST_PER_MILLION: "invalid",
    },
    transport: async () => { transportCalls += 1; return openAiResponse(); },
  });

  assert.equal(service.isAvailable(), false);
  assert.equal(service.getConfig().configured, true);
  assert.equal(service.getConfig().inputCostPerMillion, 0);
  assert.equal("apiKey" in service.getConfig(), false);
  await assert.rejects(service.generateText({ systemPrompt: "s", userContent: "u" }),
    (error) => error.code === "AI_DISABLED");
  assert.equal(transportCalls, 0);
});

test("OpenAI adapter caps tokens and records versioned usage and cost metadata", async () => {
  const requests = [];
  const logs = [];
  const service = createAiProviderService({
    environment: {
      AI_REPORTS_ENABLED: "true", AI_PROVIDER: "openai", OPENAI_API_KEY: "secret",
      OPENAI_MODEL: "primary-model", AI_MAX_OUTPUT_TOKENS: "1000",
      AI_INPUT_COST_PER_MILLION: "2", AI_OUTPUT_COST_PER_MILLION: "4",
    },
    transport: async (request) => { requests.push(request); return openAiResponse(); },
    logger: { info(message, data) { logs.push([message, data]); } },
  });

  const result = await service.generateText({
    systemPrompt: "system", userContent: "user", maxTokens: 9000,
    promptVersion: "prompt-v2", schemaVersion: "schema-v3",
  });

  const payload = JSON.parse(requests[0].body);
  assert.equal(payload.model, "primary-model");
  assert.equal(payload.max_tokens, 1000);
  assert.equal(requests[0].headers.Authorization, "Bearer secret");
  assert.deepEqual(result.usage, { input: 12, output: 8 });
  assert.equal(result.provider, "openai");
  assert.equal(result.metadata.prompt_version, "prompt-v2");
  assert.equal(result.metadata.schema_version, "schema-v3");
  assert.equal(result.metadata.estimated_cost_usd, 0.000056);
  assert.equal(logs.length, 1);
});

test("Anthropic adapter preserves its request and response contract", async () => {
  const requests = [];
  const service = createAiProviderService({
    environment: {
      AI_REPORTS_ENABLED: "true", AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "anthropic-secret", ANTHROPIC_MODEL: "claude-test",
    },
    transport: async (request) => {
      requests.push(request);
      return {
        status: 200,
        body: JSON.stringify({ content: [{ text: "{\"answer\":1}" }], usage: { input_tokens: 5, output_tokens: 7 } }),
      };
    },
    logger: { info() {} },
  });

  const result = await service.generateText({ systemPrompt: "system", userContent: "user", maxTokens: 700 });

  const payload = JSON.parse(requests[0].body);
  assert.equal(requests[0].hostname, "api.anthropic.com");
  assert.equal(requests[0].headers["x-api-key"], "anthropic-secret");
  assert.equal(payload.max_tokens, 700);
  assert.equal(result.model, "claude-test");
  assert.deepEqual(result.usage, { input: 5, output: 7 });
});

test("AI provider retries transient failures then uses the fallback model", async () => {
  const models = [];
  const delays = [];
  const service = createAiProviderService({
    environment: {
      AI_REPORTS_ENABLED: "true", AI_PROVIDER: "openai", OPENAI_API_KEY: "secret",
      OPENAI_MODEL: "primary", OPENAI_FALLBACK_MODEL: "fallback",
      AI_PROVIDER_RETRIES: "1", AI_RETRY_BASE_MS: "10",
    },
    transport: async (request) => {
      const model = JSON.parse(request.body).model;
      models.push(model);
      return model === "primary" ? { status: 429, body: "limited" } : openAiResponse();
    },
    sleep: async (delay) => { delays.push(delay); },
    logger: { info() {} },
  });

  const result = await service.generateText({ systemPrompt: "s", userContent: "u" });

  assert.deepEqual(models, ["primary", "primary", "fallback"]);
  assert.deepEqual(delays, [10]);
  assert.equal(result.model, "fallback");
});

test("AI provider retries a timed-out transport with exponential delay", async () => {
  let attempts = 0;
  const delays = [];
  const service = createAiProviderService({
    environment: {
      AI_REPORTS_ENABLED: "true", AI_PROVIDER: "openai", OPENAI_API_KEY: "secret",
      AI_PROVIDER_RETRIES: "1", AI_RETRY_BASE_MS: "25",
    },
    transport: async () => {
      attempts += 1;
      if (attempts === 1) throw new AiProviderError("timeout", {
        code: "AI_TIMEOUT", retryable: true,
      });
      return openAiResponse();
    },
    sleep: async (delay) => { delays.push(delay); },
    logger: { info() {} },
  });

  const result = await service.generateText({ systemPrompt: "s", userContent: "u" });

  assert.equal(attempts, 2);
  assert.deepEqual(delays, [25]);
  assert.equal(result.provider, "openai");
});

test("AI provider does not retry an externally aborted request", async () => {
  let transportCalls = 0;
  const controller = new AbortController();
  controller.abort();
  const service = createAiProviderService({
    environment: {
      AI_REPORTS_ENABLED: "true", AI_PROVIDER: "openai", OPENAI_API_KEY: "secret",
      AI_PROVIDER_RETRIES: "3",
    },
    transport: async () => { transportCalls += 1; throw new AiProviderError("timeout", { code: "AI_TIMEOUT", retryable: true }); },
  });

  await assert.rejects(
    service.generateText({ systemPrompt: "s", userContent: "u", signal: controller.signal }),
    (error) => error.code === "AI_ABORTED"
  );
  assert.equal(transportCalls, 0);
});
