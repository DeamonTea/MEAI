'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AI } = require('../src/ai.cjs');

function response({ status = 200, body = {}, headers = {} } = {}) {
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => normalized[String(name).toLowerCase()] || null },
    json: async () => body,
  };
}

function groqResponse(content, finishReason = 'stop', usage = { prompt_tokens: 12, completion_tokens: 8 }) {
  return response({ body: { choices: [{ finish_reason: finishReason, message: { content } }], usage } });
}

function geminiResponse(text = 'OK', finishReason = 'STOP') {
  return response({ body: { candidates: [{ finishReason, content: { parts: [{ text }] } },], usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 4 } } });
}

test('429 Retry-After waits once after all keys are limited, then retries', async () => {
  const originalFetch = global.fetch;
  const calls = [], usage = [], waits = [], sleeps = [];
  global.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return calls.length <= 2
      ? response({ status: 429, body: { error: { message: 'rate limited' } }, headers: { 'retry-after': '0.01' } })
      : groqResponse('Roger.');
  };

  try {
    const ai = new AI(
      () => ['key-a', 'key-b'],
      () => 'unused',
      async () => {},
      async value => usage.push(value),
      async seconds => waits.push(seconds),
      async ms => sleeps.push(ms),
    );
    assert.equal(await ai.request('short prompt', { provider: 'groq' }), 'Roger.');
    assert.equal(calls.length, 3);
    assert.deepEqual(waits, [1]);
    assert.deepEqual(sleeps, [10]);
    assert.equal(usage.length, 1);
    assert.equal(calls[0].reasoning_effort, 'low');
  } finally {
    global.fetch = originalFetch;
  }
});

test('Gemini retryDelay is read from rate limit details', async () => {
  const originalFetch = global.fetch;
  const waits = [], sleeps = [];
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return calls === 1
      ? response({ status: 429, body: { error: { message: 'rate limited', details: [{ retryDelay: '0.5s' }] } } })
      : geminiResponse('Đã thử lại.');
  };

  try {
    const ai = new AI(() => ['key-a'], () => 'gemini-test', async () => {}, async () => {}, async seconds => waits.push(seconds), async ms => sleeps.push(ms));
    assert.equal(await ai.request('prompt', { provider: 'gemini' }), 'Đã thử lại.');
    assert.equal(calls, 2);
    assert.deepEqual(waits, [1]);
    assert.deepEqual(sleeps, [500]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('failed 429 requests do not record usage', async () => {
  const originalFetch = global.fetch;
  let usageCalls = 0, quotaCalls = 0;
  global.fetch = async () => response({ status: 429, body: { error: { message: 'rate limited' } } });

  try {
    const ai = new AI(() => ['key-a', 'key-b'], () => 'unused', async () => { quotaCalls++; }, async () => { usageCalls++; });
    await assert.rejects(ai.request('short prompt', { provider: 'groq' }), /Tất cả 2 API key groq/);
    assert.equal(quotaCalls, 1);
    assert.equal(usageCalls, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('Groq empty completion retries once with double budget and low reasoning effort', async () => {
  const originalFetch = global.fetch;
  const payloads = [];
  global.fetch = async (_url, options) => {
    payloads.push(JSON.parse(options.body));
    return payloads.length === 1 ? groqResponse('') : groqResponse('Ready.');
  };

  try {
    const ai = new AI(() => ['key-a'], () => 'unused');
    assert.equal(await ai.request('chat prompt', { provider: 'groq', maxOutputTokens: 700 }), 'Ready.');
    assert.deepEqual(payloads.map(x => x.max_completion_tokens), [1800, 3600]);
    assert.ok(payloads.every(x => x.reasoning_effort === 'low'));
  } finally {
    global.fetch = originalFetch;
  }
});

test('Groq truncated JSON retries with doubled JSON budget', async () => {
  const originalFetch = global.fetch;
  const payloads = [];
  global.fetch = async (_url, options) => {
    payloads.push(JSON.parse(options.body));
    return payloads.length === 1 ? groqResponse('{"answer":', 'length') : groqResponse('{"answer":"OK"}');
  };

  try {
    const ai = new AI(() => ['key-a'], () => 'unused');
    assert.deepEqual(await ai.request('JSON prompt', { provider: 'groq', json: true, maxOutputTokens: 2400 }), { answer: 'OK' });
    assert.deepEqual(payloads.map(x => x.max_completion_tokens), [4000, 8000]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('Gemini MAX_TOKENS reports a cut result instead of invalid JSON', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => geminiResponse('{"incomplete":', 'MAX_TOKENS');

  try {
    const ai = new AI(() => ['key-a'], () => 'gemini-test');
    await assert.rejects(
      ai.request('JSON prompt', { provider: 'gemini', json: true }),
      error => error.code === 'AI_TRUNCATED' && /đã cắt kết quả do giới hạn token/.test(error.message) && !/JSON không hợp lệ/.test(error.message),
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('AI connectivity test bypasses quota checks and usage accounting', async () => {
  const originalFetch = global.fetch;
  let quotaCalls = 0, usageCalls = 0;
  global.fetch = async () => geminiResponse('OK');

  try {
    const ai = new AI(() => ['key-a'], () => 'gemini-test', async () => { quotaCalls++; }, async () => { usageCalls++; });
    assert.equal((await ai.test('gemini')).response, 'OK');
    assert.equal(quotaCalls, 0);
    assert.equal(usageCalls, 0);
  } finally {
    global.fetch = originalFetch;
  }
});
