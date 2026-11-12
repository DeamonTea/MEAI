'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AI } = require('../src/ai.cjs');

function geminiResponse(value, finishReason = 'STOP') {
  return {
    ok: true,
    json: async () => ({
      candidates: [{
        finishReason,
        content: { parts: [{ text: JSON.stringify(value) }] },
      }],
    }),
  };
}

test('Unit analysis summarizes the reading in one bounded AI call', async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    return geminiResponse({
      summary: 'Tóm tắt thử.',
      cefr: 'B1',
      cefrRationale: 'Văn bản có các đoạn liên kết.',
      grammarExplanation: 'AI diễn giải ngắn.',
      readingBoundaries: [],
    });
  };

  try {
    const ai = new AI(() => ['mock-key'], () => 'mock-model');
    const result = await ai.analyzeUnit({
      bookTitle: 'Giáo trình thử',
      branch: 'unassigned',
      unitTitle: 'Unit 1',
      source: 'SOURCE_ONLY_SENTINEL',
      readingText: 'READING_INPUT_SENTINEL',
      grammarText: 'GRAMMAR_INPUT_SENTINEL',
      glossaryAuthoritative: true,
    });
    assert.equal(requests.length, 1);
    assert.ok(requests[0].generationConfig.maxOutputTokens <= 6000);
    assert.equal(requests[0].generationConfig.thinkingConfig.thinkingLevel, 'medium');
    const prompt = requests[0].contents[0].parts[0].text;
    assert.ok(prompt.includes('READING_INPUT_SENTINEL'));
    assert.ok(prompt.includes('GRAMMAR_INPUT_SENTINEL'));
    assert.equal(prompt.includes('SOURCE_ONLY_SENTINEL'), false);
    assert.equal(result.summary, 'Tóm tắt thử.');
    assert.deepEqual(result.vocabulary, []);
  } finally {
    global.fetch = originalFetch;
  }
});

test('a truncated Unit summary is retried with two input halves', async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    if (requests.length === 1) {
      return geminiResponse({ summary: 'truncated' }, 'MAX_TOKENS');
    }
    return geminiResponse({
      summary: 'Phần thử.',
      cefr: 'A2',
      cefrRationale: 'Mẫu ngắn.',
      grammarExplanation: '',
      readingBoundaries: [],
    });
  };

  try {
    const ai = new AI(() => ['mock-key'], () => 'mock-model');
    const result = await ai.analyzeUnit({
      bookTitle: 'Giáo trình thử',
      branch: 'unassigned',
      unitTitle: 'Unit 1',
      readingText: 'Một đoạn văn tự soạn. '.repeat(20),
      grammarText: '',
    });
    assert.equal(requests.length, 3);
    assert.ok(requests.every(x => x.generationConfig.maxOutputTokens <= 6000));
    assert.equal(result.summary, 'Phần thử. Phần thử.');
    assert.equal(result.cefr, 'A2');
  } finally {
    global.fetch = originalFetch;
  }
});

test('summary analysis does not send the whole Unit when no reading section exists', async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return geminiResponse({ summary: '', cefr: 'Chưa xác định' });
  };

  try {
    const ai = new AI(() => ['mock-key'], () => 'mock-model');
    const result = await ai.analyzeUnit({
      bookTitle: 'Giáo trình thử',
      branch: 'unassigned',
      unitTitle: 'Unit 1',
      source: 'UNIT_SOURCE_SENTINEL',
      readingText: '',
      grammarText: '',
    });
    assert.equal(calls, 0);
    assert.ok(result.validationWarnings.some(x => x.includes('Không có văn bản bài đọc')));
  } finally {
    global.fetch = originalFetch;
  }
});
