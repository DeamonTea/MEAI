'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyExerciseKind, splitExerciseSets, parseOptions, tableRows,
  normalizeIpa, findIpaGlossaryMatch, verifyExerciseAnswer,
  gradeExerciseItems, validateSimilarExerciseItems,
} = require('../src/exercises.cjs');
const { AI } = require('../src/ai.cjs');
const { validateAnalysis } = require('../src/core.cjs');

const fixtures = [
  ['Answer the following questions.', 'short_answer'],
  ['True (T), False (F).', 'true_false'],
  ['True (T), False (F), Not Given (NG).', 'true_false'],
  ['Choose the correct answer.', 'multiple_choice'],
  ['Circle the best option.', 'multiple_choice'],
  ['Fill in the blanks. NO MORE THAN 3 WORDS.', 'fill_blank'],
  ['Complete the summary using words in the box.', 'fill_blank'],
  ['Write the correct form of the verbs.', 'verb_form'],
  ['Match the phrases in column A with column B.', 'matching'],
  ['Choose a letter to classify each item. Any letter more than once.', 'classify'],
  ['Decide if each noun is countable (C) or uncountable (UC).', 'classify'],
  ['Find the words in the text for the definitions.', 'definition_to_word'],
  ['Complete the word family table.', 'table_fill'],
  ['Write the words for these phonetic transcriptions.', 'ipa_to_word'],
  ['Change the sentences from active to passive.', 'transform'],
  ['Find all the words with these suffixes in the text.', 'extract_from_text'],
  ['Discuss the questions in pairs.', 'discussion'],
  ['Look at the picture and describe it.', 'image_based'],
  ['Read and think about the topic.', 'other'],
];

test('classifies the supported exercise instruction patterns', () => {
  for (const [instruction, kind] of fixtures) {
    assert.equal(classifyExerciseKind(instruction).kind, kind, instruction);
  }
});

test('parses multiple choice options on a single line', () => {
  const parsed = parseOptions('1. Choose a number: a. 2 b. 3 c. 4 d. 5');
  assert.equal(parsed.prompt, 'Choose a number:');
  assert.deepEqual(parsed.options, [
    { label: 'a', text: '2' }, { label: 'b', text: '3' },
    { label: 'c', text: '4' }, { label: 'd', text: '5' },
  ]);
});

test('parses matching pairs, word-family grid blanks and unnumbered grammar Exercise', () => {
  const matching = splitExerciseSets('Task 1: Match the phrases.\n| 1. take | a. action |\n| 2. carry out | b. a task |', 'tasks', 1, 'unit-a')[0];
  assert.equal(matching.kind, 'matching');
  assert.deepEqual(matching.items[0].left, [{ no: 1, text: 'take' }, { no: 2, text: 'carry out' }]);
  assert.deepEqual(matching.items[0].right, [{ label: 'a', text: 'action' }, { label: 'b', text: 'a task' }]);

  const eightRows = Array.from({ length: 8 }, (_, index) => `| ${index + 1}. verb ${index + 1} | ${String.fromCharCode(97 + index)}. phrase ${index + 1} |`).join('\n');
  const eightPairs = splitExerciseSets(`Exercise 1: Match the phrasal verbs.\n${eightRows}`, 'grammar', 1, 'unit-b')[0];
  assert.equal(eightPairs.items.length, 8);
  assert.equal(eightPairs.items[7].right[7].label, 'h');

  const table = splitExerciseSets('Exercise: Complete the word family table.\n| Noun | Verb | Adjective |\n| decision | decide | ____ |', 'grammar', 3, 'unit-a')[0];
  assert.equal(table.title, 'Exercise');
  assert.equal(table.kind, 'table_fill');
  assert.equal(table.items[0].grid[1][2], '____');
  assert.equal(table.items[0].blanks[0].column, 2);

  const fill = splitExerciseSets('Task 2: Complete the summary. NO MORE THAN 3 WORDS.\n1. The crew sent ____ to the station.', 'tasks', 4, 'unit-a')[0];
  assert.equal(fill.kind, 'fill_blank');
  assert.equal(fill.items[0].wordLimit, 3);
  assert.equal(fill.items[0].blanks.length, 1);

  const definition = splitExerciseSets('Task 1: Find the words in the text for the definitions.\n| Paragraph | Definitions | Words |\n| para.3 | A machine used to send a signal. | ____ |', 'tasks', 1, 'unit-a')[0];
  assert.equal(definition.kind, 'definition_to_word');
  assert.equal(definition.items[0].hint, 'para.3');
  assert.match(definition.items[0].prompt, /A machine used to send a signal/);

  const tf = splitExerciseSets('Task 3: True (T), False (F), Not Given (NG).\n1. The crew used a radio.', 'tasks', 5, 'unit-a')[0];
  assert.deepEqual(tf.items[0].options, ['T', 'F', 'NG']);
});

test('keeps structured exercise fields through analysis validation and still accepts legacy questions', () => {
  const structured = splitExerciseSets('Task 1: Answer the following questions.\n1. Who sent the message?', 'tasks', 1, 'unit-a')[0].items[0];
  const result = validateAnalysis({
    summary: '', cefr: 'B1', vocabulary: [], readings: [], grammar: [],
    exercises: [structured, { type: 'Bài tập gốc', question: 'Task 1. Match these words.', evidence: 'Task 1. Match these words.', options: [], answer: '', answerEvidence: '' }],
  }, 'Task 1: Answer the following questions.\n1. Who sent the message?\nTask 1. Match these words.');
  assert.equal(result.exercises[0].itemKey, 'unit-a:1:1');
  assert.equal(result.exercises[0].kind, 'short_answer');
  assert.equal(result.exercises[0].answerCheck, null);
  assert.equal(result.exercises[0].page, null);
  assert.equal(result.exercises[1].question, 'Task 1. Match these words.');
});

test('normalizes IPA and matches glossary entries', () => {
  assert.equal(normalizeIpa('/ˈmɛsɪʤ/'), normalizeIpa('/ˌmɛsɪʤ/'));
  assert.equal(findIpaGlossaryMatch('/ˈmɛsɪʤ/', [{ term: 'message', ipa: '/mɛsɪʤ/' }]).term, 'message');
  assert.equal(findIpaGlossaryMatch('/not-found/', [{ term: 'message', ipa: '/mɛsɪʤ/' }]), null);
});

test('validates answer evidence, choice membership, fill limits, and flags unsupported evidence', () => {
  const source = 'The crew will transmit three short messages by radio.';
  const base = { kind: 'multiple_choice', options: [{ label: 'a', text: 'radio' }, { label: 'b', text: 'telephone' }] };
  assert.equal(verifyExerciseAnswer(base, { answer: 'a', evidence: 'transmit three short messages', confidence: 0.9 }, source).answerStatus, 'verified_ai');
  assert.equal(verifyExerciseAnswer(base, { answer: 'z', evidence: 'transmit three short messages', confidence: 0.9 }, source).answerStatus, 'needs_review');
  assert.equal(verifyExerciseAnswer({ kind: 'fill_blank', wordLimit: 2 }, { answer: ['three short messages'], evidence: 'three short messages by radio', confidence: 0.9 }, source).answerStatus, 'needs_review');
  assert.equal(verifyExerciseAnswer({ kind: 'short_answer' }, { answer: 'By radio.', evidence: 'invented quotation', confidence: 0.95 }, source).answerStatus, 'needs_review');
  assert.equal(verifyExerciseAnswer({ kind: 'true_false', options: ['T', 'F', 'NG'] }, { answer: 'True', evidence: 'The crew will transmit', confidence: 0.9 }, source).answer, 't');
});

test('scores only confirmed or verified objective items', () => {
  const result = gradeExerciseItems([
    { itemKey: 'u:1:1', kind: 'multiple_choice', answerStatus: 'verified_ai', answer: 'radio', options: [{ label: 'a', text: 'radio' }] },
    { itemKey: 'u:1:2', kind: 'fill_blank', answerStatus: 'confirmed', answer: ['three', 'messages'] },
    { itemKey: 'u:1:3', kind: 'short_answer', answerStatus: 'verified_ai', answer: 'By radio.' },
    { itemKey: 'u:1:4', kind: 'true_false', answerStatus: 'needs_review', answer: 'T' },
  ], { 'u:1:1': 'a', 'u:1:2': 'three | messages' });
  assert.deepEqual({ score: result.score, total: result.total }, { score: 2, total: 2 });
});

test('grades supported exercise kinds, answer variants and word limits', () => {
  const items = [
    { itemKey: 'u:1:1', kind: 'multiple_choice', answerStatus: 'verified_ai', answer: 'b', options: [{ label: 'a', text: 'old' }, { label: 'b', text: 'The correct option' }] },
    { itemKey: 'u:1:2', kind: 'true_false', answerStatus: 'confirmed', answer: 't' },
    { itemKey: 'u:1:3', kind: 'fill_blank', answerStatus: 'verified_ai', answer: ['radio / wireless set'], wordLimit: 2 },
    { itemKey: 'u:1:4', kind: 'fill_blank', answerStatus: 'confirmed', answer: 'three short messages', wordLimit: 2 },
    { itemKey: 'u:1:5', kind: 'verb_form', answerStatus: 'verified_ai', answer: 'transmits' },
    { itemKey: 'u:1:6', kind: 'matching', answerStatus: 'confirmed', answer: 'b', right: [{ label: 'a', text: 'first' }, { label: 'b', text: 'second' }] },
    { itemKey: 'u:1:7', kind: 'definition_to_word', answerStatus: 'verified_ai', answer: 'message' },
    { itemKey: 'u:1:8', kind: 'ipa_to_word', answerStatus: 'verified_ai', answer: 'Message' },
  ];
  const result = gradeExerciseItems(items, {
    'u:1:1': 'B', 'u:1:2': 'T', 'u:1:3': 'WIRELESS   SET',
    'u:1:4': 'three short messages', 'u:1:5': '  TRANSMITS ',
    'u:1:6': 'b', 'u:1:7': 'MESSAGE', 'u:1:8': ' message ',
  });
  assert.equal(result.total, 8);
  assert.equal(result.score, 7);
  assert.equal(result.results.find(x => x.itemKey === 'u:1:4').reason, 'Một đáp án vượt quá giới hạn 2 từ.');
  assert.equal(result.results.find(x => x.itemKey === 'u:1:6').correct, true);
});

test('accepts answer alternatives separated by slash or pipe', () => {
  const result = gradeExerciseItems([
    { itemKey: 'u:1:1', kind: 'fill_blank', answerStatus: 'confirmed', answer: 'radio / wireless set' },
    { itemKey: 'u:1:2', kind: 'fill_blank', answerStatus: 'confirmed', answer: 'transmit|send' },
  ], { 'u:1:1': 'wireless set', 'u:1:2': 'SEND' });
  assert.equal(result.score, 2);
});

test('does not include unchecked questions in score and marks the reason', () => {
  const result = gradeExerciseItems([
    { itemKey: 'u:1:1', kind: 'true_false', answerStatus: 'needs_review', answer: 'T' },
    { itemKey: 'u:1:2', kind: 'multiple_choice', answerStatus: 'none', answer: '' },
  ], { 'u:1:1': 'T', 'u:1:2': 'a' });
  assert.equal(result.total, 0);
  assert.equal(result.results[0].correct, null);
  assert.match(result.results[0].reason, /không tính điểm/);
});

test('validates generated similar items independently and drops invalid questions', () => {
  const source = 'A radio operator sends a short message to the central office.';
  const result = validateSimilarExerciseItems([
    { prompt: 'The operator ____ a message.', answer: 'sends', evidence: 'sends a short message', explanation: 'Căn cứ câu trong bài.' },
    { prompt: 'Original prompt', answer: 'sends', evidence: 'sends a short message', explanation: 'Câu trùng bộ gốc.' },
    { prompt: 'They ____ at once.', answer: '', evidence: 'sends a short message', explanation: 'Thiếu đáp án.' },
  ], { kind: 'fill_blank', items: [{ prompt: 'Original prompt' }] }, source);
  assert.equal(result.items.length, 1);
  assert.equal(result.rejected, 2);
  const multipleChoice = validateSimilarExerciseItems([{
    prompt: 'What does the radio operator send?', options: [
      { label: 'a', text: 'A short message' }, { label: 'b', text: 'A long cable' },
      { label: 'c', text: 'A switchboard' }, { label: 'd', text: 'A telephone trunk' },
    ], answerLabel: 'a', answer: 'a', evidence: 'sends a short message', explanation: 'Đáp án khớp với bài đọc.',
  }], { kind: 'multiple_choice', items: [] }, source);
  assert.equal(multipleChoice.items[0].answer, 'a');
});

test('solveExerciseSet uses mocked fetch and returns one structured answer batch', async () => {
  const originalFetch = global.fetch;
  let requestedPayload;
  global.fetch = async (_url, options) => {
    requestedPayload = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ items: [{ no: 1, answer: 'a', evidence: 'three short messages', confidence: 0.95 }] }) }] } },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
      }),
    };
  };
  try {
    const ai = new AI(() => ['fake-key'], () => 'unused');
    const reading = 'The crew will transmit three short messages by radio.';
    const item = { no: 1, prompt: 'How?', kind: 'multiple_choice', options: [{ label: 'a', text: 'radio' }] };
    const result = await ai.solveExerciseSet({
      reading,
      set: { setIndex: 1, title: 'Task 1', kind: 'multiple_choice', instruction: 'Choose the correct answer.', items: [item] },
    });
    assert.equal(result.items[0].answer, 'a');
    assert.equal(verifyExerciseAnswer(item, result.items[0], reading, reading).answerStatus, 'verified_ai');
    assert.equal(requestedPayload.generationConfig.thinkingConfig.thinkingLevel, 'low');
    assert.ok(requestedPayload.generationConfig.maxOutputTokens >= 4000);
  } finally {
    global.fetch = originalFetch;
  }
});

test('generateSimilarExerciseSet uses mocked Cerebras and keeps valid questions only', async () => {
  const originalFetch = global.fetch;
  const source = 'The radio operator sends a short message to the central office.';
  let payload;
  global.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    const result = { questions: [
      { prompt: 'The radio operator ____ a short message.', answer: 'sends', evidence: 'sends a short message', explanation: 'Động từ chia ngôi thứ ba.' },
      { prompt: 'The central office ____ the line.', answer: 'controls', evidence: 'central office', explanation: 'Dùng đúng chủ ngữ.' },
    ] };
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }], usage: { prompt_tokens: 10, completion_tokens: 20 } }) };
  };
  try {
    const ai = new AI(() => ['fake-key'], () => 'unused');
    const result = await ai.generateSimilarExerciseSet({
      bookTitle: 'Sample', unitTitle: 'Unit 1', source,
      analysis: { readings: [{ content: source }], vocabulary: [{ term: 'message' }] },
      set: { kind: 'fill_blank', setIndex: 1, title: 'Task 2', items: [{ prompt: 'The ____ sends a message.' }] },
    });
    assert.equal(payload.model, 'qwen-3.8-27b');
    assert.equal(result.items.length, 1);
    assert.equal(result.rejected, 1);
    assert.equal(result.items[0].answerStatus, 'verified_ai');
  } finally { global.fetch = originalFetch; }
});
