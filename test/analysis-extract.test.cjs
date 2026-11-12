'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { htmlToStructuredText } = require('../src/docx-structure.cjs');
const {
  splitUnits,
  detectSections,
  parseGlossary,
  splitReadings,
  splitReadingByQuotes,
  extractDiscussionTopics,
  selectRelevantContext,
  validateAnalysis,
} = require('../src/core.cjs');

test('splitUnits keeps the uppercase name immediately after a Unit heading', () => {
  const source = [
    '## UNIT 1',
    'SIGNAL OPERATIONS',
    '## A. STARTER',
    'Self-written starter line.',
    '## F. GLOSSARY',
    '| 1. signal | (n) | a sign |',
    'Self-written body text. '.repeat(20),
  ].join('\n');

  assert.equal(splitUnits([{ page: 1, text: source }])[0].title, 'Unit 1 — SIGNAL OPERATIONS');

  const sameLine = '## Unit 2 — RADIO PROCEDURES\n## A. STARTER\n' +
    'Self-written body text. '.repeat(20);
  assert.equal(splitUnits([{ page: 1, text: sameLine }])[0].title, 'Unit 2 — RADIO PROCEDURES');
});

test('detectSections recognizes headings, whitespace, table-contained headings, and fallback labels', () => {
  const source = [
    '## A.    STARTER',
    'Say hello.',
    '## B. DISCUSSION',
    'What is a signal?',
    '## C. PRESENTATION',
    '(1) First paragraph.',
    '## D. COMPREHENSION',
    'Task 1. Read.',
    '## E.   GRAMMAR   FOCUS',
    'Use the present simple.',
    '[BẢNG]',
    '## F. GLOSSARY',
    '| 1. signal | (n) | a sign |',
    '[/BẢNG]',
  ].join('\n');
  const detected = detectSections(source);

  assert.deepEqual(detected.sections.map(x => x.kind), [
    'starter', 'discussion', 'reading', 'tasks', 'grammar', 'glossary',
  ]);
  assert.equal(detected.nonStandard, false);
  assert.ok(detected.sections.every(x => x.text === source.slice(x.start, x.end)));

  const tableHeading = htmlToStructuredText(
    '<table><tr><td><p><strong>F. GLOSSARY</strong></p></td></tr></table>',
  );
  assert.deepEqual(detectSections(tableHeading + '\n| 1. signal | (n) | a sign |').sections.map(x => x.kind), ['glossary']);

  const fallback = detectSections('A. STARTER\nWarm up.\nC. PRESENTATION\n(1) Read.');
  assert.equal(fallback.nonStandard, true);
  assert.deepEqual(fallback.sections.map(x => x.kind), ['starter', 'reading']);
});

test('parseGlossary handles ten table and flat row variants with exact evidence', () => {
  const rows = [
    '| 1. message | (n) | /ˈmɛsɪʤ/ | bản tin |',
    '| 2. coalesce (v) | /ˌkaʊəˈlɛs/ | kết hợp, hòa nhập |',
    '| put into practical | (ph.v) | đưa vào thực tế |',
    '| 4. signal | (n) | tín hiệu, dấu hiệu |',
    '| 5. rapidly | /ˈræpɪdli/ | nhanh chóng |',
    '| 6. engage | (v) | tham gia |',
    '| 7. air traffic | (n) | /ˈɛə ˌtræfɪk/ | không lưu, giao thông hàng không |',
    '| 8. call sign | (n) | dấu hiệu gọi |',
    '| 9. communicate | (v) | /kəˈmjuːnɪkeɪt/ | liên lạc |',
    '| 10. break | (ph.v) | ngừng; tạm dừng |',
    '| 11. phrase || cụm từ, cách diễn đạt |',
    '14. coalesce (v) /ˌkaʊəˈlɛs/ kết hợp',
    '| 12. ??? || |',
  ];
  const source = '## F. GLOSSARY\n[BẢNG]\n' + rows.join('\n') + '\n[/BẢNG]';
  const parsed = parseGlossary(source);

  assert.equal(parsed.found, true);
  assert.ok(parsed.items.length >= 10);
  assert.equal(parsed.items[0].term, 'message');
  assert.equal(parsed.items[0].no, 1);
  assert.equal(parsed.items[0].partOfSpeech, 'n');
  assert.equal(parsed.items[0].ipa, '/ˈmɛsɪʤ/');
  assert.equal(parsed.items[0].meaning, 'bản tin');
  assert.equal(parsed.items[0].evidence, rows[0]);
  assert.equal(parsed.items.find(x => x.term === 'coalesce').meaning, 'kết hợp, hòa nhập');
  assert.equal(parsed.items.find(x => x.term === 'put into practical').partOfSpeech, 'ph.v');
  assert.equal(parsed.items.find(x => x.term === 'air traffic').meaning, 'không lưu, giao thông hàng không');
  assert.equal(parsed.items.find(x => x.term === 'phrase').meaning, 'cụm từ, cách diễn đạt');
  assert.ok(parsed.items.every(x => x.fromGlossary && x.sourceVerified));
  assert.ok(parsed.unparsedRows.includes(rows.at(-1)));
});

test('splitReadings keeps all numbered paragraphs and separates titled readings', () => {
  const paragraphs = Array.from({ length: 11 }, (_, i) => '(' + (i + 1) + ') Paragraph ' + (i + 1) + '.');
  const one = splitReadings('## C. PRESENTATION\nCOMMUNICATION\n' + paragraphs.join('\n'));
  assert.equal(one.length, 1);
  assert.ok(one[0].content.includes('(1) Paragraph 1.'));
  assert.ok(one[0].content.includes('(11) Paragraph 11.'));

  const multiple = splitReadings([
    '## C. PRESENTATION',
    '## READING ONE',
    '(1) First reading begins.',
    '(2) First reading continues.',
    'MESSAGE FLOW',
    '(1) Second reading begins.',
    '(2) Second reading continues.',
  ].join('\n'));
  assert.equal(multiple.length, 2);
  assert.equal(multiple[0].title, 'READING ONE');
  assert.ok(multiple[1].content.includes('(1) Second reading begins.'));
});

test('AI reading boundaries only split on short verbatim quotes', () => {
  const source = 'Title A\n(1) Opening A.\n(2) Ending A.\nTitle B\n(1) Opening B.\n(2) Ending B.';
  const split = splitReadingByQuotes(source, [
    { title: 'Title A', startQuote: '(1) Opening A.', endQuote: '(2) Ending A.' },
    { title: 'Title B', startQuote: '(1) Opening B.', endQuote: '(2) Ending B.' },
  ]);
  assert.equal(split.length, 2);
  assert.ok(split[0].content.includes('(2) Ending A.'));
  assert.deepEqual(splitReadingByQuotes(source, [
    { title: 'Invalid', startQuote: 'x'.repeat(81), endQuote: 'end' },
  ]), []);
});

test('validated analysis retains full source reading, grammar, and Glossary provenance', () => {
  const reading = '## C. PRESENTATION\n(1) First paragraph.\n(2) Second paragraph.';
  const grammar = '## E. GRAMMAR FOCUS\nForm: subject + verb.\nUse: describe a routine.';
  const vocabularyRow = '| 1. signal | (n) | a sign |';
  const source = [reading, grammar, vocabularyRow].join('\n');
  const result = validateAnalysis({
    summary: '',
    vocabulary: [{
      no: 1,
      term: 'signal',
      partOfSpeech: 'n',
      ipa: '',
      meaning: 'a sign',
      evidence: vocabularyRow,
      fromGlossary: true,
      sourceVerified: true,
    }],
    readings: [{ title: 'Bài đọc', content: reading, evidence: reading.slice(0, 30) }],
    exercises: [],
    grammar: [{ title: 'Ngữ pháp', explanation: 'AI diễn giải: dùng cho thói quen.', evidence: grammar }],
  }, source);

  assert.equal(result.readings[0].content, reading);
  assert.equal(result.grammar[0].evidence, grammar);
  assert.equal(result.vocabulary[0].fromGlossary, true);
  assert.equal(result.vocabulary[0].sourceVerified, true);
});

test('discussion prompts are separated into independently usable speaking scenarios', () => {
  assert.deepEqual(
    extractDiscussionTopics('## B. DISCUSSION\n1. What is a signal? Why is it useful?\n| Which device do you use? |'),
    ['What is a signal?', 'Why is it useful?', 'Which device do you use?'],
  );
  assert.deepEqual(
    extractDiscussionTopics('## B. DISCUSSION\nDescribe your team. Explain its role.'),
    ['Describe your team.', 'Explain its role.'],
  );
});

test('selectRelevantContext prefers keyword matches and always keeps Glossary rows', () => {
  const source = [
    'IRRELEVANT_INTRODUCTION ' + 'general material '.repeat(60),
    '## F. GLOSSARY',
    '| 1. radio relay | (n) | trạm chuyển tiếp vô tuyến |',
    '| 2. signal report | (n) | báo cáo tín hiệu |',
    '## G. OTHER SECTION',
    'RELEVANT_RADIO_RELAY ' + 'radio relay procedure '.repeat(60),
  ].join('\n');
  const selected = selectRelevantContext(source, 'radio relay procedure', 1300);

  assert.ok(selected.includes('RELEVANT_RADIO_RELAY'));
  assert.ok(selected.includes('| 1. radio relay | (n) | trạm chuyển tiếp vô tuyến |'));
  assert.ok(selected.includes('| 2. signal report | (n) | báo cáo tín hiệu |'));
  assert.ok(!selected.includes('IRRELEVANT_INTRODUCTION'));
  assert.ok(selected.length <= 1300);
});
