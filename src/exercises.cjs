'use strict';

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

function wordCount(value) {
  const token = String(value || '').trim().toLowerCase();
  return /^\d+$/.test(token) ? Number(token) : NUMBER_WORDS[token] || null;
}

function tableRows(text) {
  return String(text || '').split(/\r?\n/).filter(line => /^\s*\|/.test(line)).map(line => ({
    raw: line,
    cells: line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim()),
  })).filter(row => row.cells.length > 1 && !row.cells.every(cell => /^:?-{2,}:?$/.test(cell)));
}

function parseOptions(text) {
  const source = String(text || ''), marks = [];
  const re = /(?:^|[\s|])([a-h])[.)]\s*/gim;
  for (const match of source.matchAll(re)) marks.push({ label: match[1].toLowerCase(), start: match.index + match[0].length - match[0].trimStart().length, end: match.index + match[0].length });
  if (marks.length < 2) return { prompt: source.trim(), options: [] };
  const options = marks.map((mark, index) => ({
    label: mark.label,
    text: source.slice(mark.end, marks[index + 1]?.start ?? source.length).replace(/[|\s]+$/g, '').trim(),
  })).filter(option => option.text);
  const prompt = source.slice(0, marks[0].start).replace(/[|\s]+$/g, '').replace(/^\s*(?:\d+\s*[.)]|\(\d+\))\s*/, '').trim();
  return { prompt, options };
}

function listOptions(text) {
  return String(text || '').split(/\r?\n/).map(line => line.trim())
    .map(line => line.match(/^\s*([A-H])[.)]\s*(.+)$/i))
    .filter(Boolean).map(match => ({ label: match[1].toLowerCase(), text: match[2].trim() }));
}

function classifyExerciseKind(instruction, rawText = '') {
  const text = `${instruction || ''}\n${rawText || ''}`;
  const normalized = text.toLowerCase();
  if (/\b(?:look at|refer to|use|describe|complete|answer).{0,50}\b(?:picture|image|photograph|photo|figure)\b/i.test(text) || (/\[hình\s*\d+\]/i.test(text) && !String(rawText).replace(/\[hình\s*\d+\]/ig, '').replace(/^#+.*$/gm, '').replace(/[\s|\[\]_/.-]/g, '').trim())) return { kind: 'image_based' };
  if (/\b(?:discuss|talk about|work in pairs|discuss in pairs|speaking discussion)\b/i.test(text)) return { kind: 'discussion' };
  if (/\b(?:write the words? for these phonetic transcriptions|write the word represented by|phonetic transcriptions|ipa transcriptions)\b/i.test(text)) return { kind: 'ipa_to_word' };
  if (/\b(?:find the words?|find expressions?)\b.{0,80}\b(?:in the text|for the definitions|definitions)\b/i.test(text) || /\bdefinitions\s*\|\s*words\b/i.test(text)) return { kind: 'definition_to_word' };
  if (/\b(?:word family|complete the table|fill in the table|complete the chart|adjective\s*(?:→|to)\s*adverb|adjective to adverb)\b/i.test(text) || (tableRows(rawText).length && /\b(?:table|chart|word forms?)\b/i.test(instruction) && /_{3,}|…{2,}/.test(rawText))) return { kind: 'table_fill' };
  if (/\b(?:fill in the (?:blanks?|gaps?|missing words?)|complete the (?:summary|sentences?)|use the words? in the box|no more than\s+\w+\s+words?)\b/i.test(text)) {
    const match = text.match(/\bno more than\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+words?\b/i);
    const bankLine = String(rawText || instruction).split(/\r?\n/).find(line => /\bwords?\s+in\s+the\s+box\b/i.test(line));
    const wordBank = bankLine ? bankLine.replace(/^.*?\bwords?\s+in\s+the\s+box\b\s*:?/i, '').split(/[,;|]/).map(x => x.trim()).filter(Boolean) : [];
    return { kind: 'fill_blank', wordLimit: match ? wordCount(match[1]) : null, wordBank };
  }
  if (/\b(?:write the correct form of the verbs?|using the words? in brackets?|put the verbs? in brackets? into the correct form|correct form of the verb)\b/i.test(text)) {
    const hints = [...String(rawText || '').matchAll(/[([]([^\])]{1,80})[)\]]/g)].map(match => match[1].trim()).filter(Boolean);
    return { kind: 'verb_form', hint: hints };
  }
  if (/\b(?:true\s*\(\s*t\s*\)\s*,?\s*false\s*\(\s*f\s*\)|true\s*\/\s*false|true or false)/i.test(text)) {
    return { kind: 'true_false', options: /\bnot given\b|\bt\/f\/ng\b/i.test(text) ? ['T', 'F', 'NG'] : ['T', 'F'] };
  }
  if (/\b(?:match|matching)\b/i.test(instruction) || (tableRows(rawText).some(row => /^\s*\d+[.)]/.test(row.cells[0]) && /^\s*[a-h][.)]/i.test(row.cells[1] || '')))) return { kind: 'matching' };
  if (/\b(?:choose a letter to classify|any letter more than once|classify the following|countable\s*\(\s*c\s*\)\s*or\s*uncountable\s*\(\s*uc\s*\)|countable or uncountable)/i.test(text)) {
    const options = [...listOptions(rawText), ...parseOptions(rawText).options];
    if (/countable\s*\(\s*c\s*\)\s*or\s*uncountable\s*\(\s*uc\s*\)/i.test(text)) options.push({ label: 'c', text: 'countable' }, { label: 'uc', text: 'uncountable' });
    return { kind: 'classify', options };
  }
  if (/\b(?:choose the correct answer|circle the best (?:option|answer)|select the correct option)\b/i.test(instruction) || listOptions(rawText).length >= 2 || parseOptions(rawText).options.length >= 2) return { kind: 'multiple_choice' };
  if (/\b(?:answer the )?(?:following )?questions\b/i.test(instruction)) return { kind: 'short_answer' };
  if (/\b(?:change|rewrite).{0,60}\bactive\b.{0,30}\bpassive\b|\bcombine two sentences?\b.{0,80}\brelative clauses?\b/i.test(text)) return { kind: 'transform' };
  if (/\b(?:find (?:all )?(?:the )?(?:sentences?|words?)|underline|circle).{0,100}\b(?:contains?|suffix|text|passage|that)\b/i.test(text) || /\bfind all the words?\b.{0,80}\bsuffix(?:es)?\b/i.test(text)) return { kind: 'extract_from_text' };
  if (/\banswer\b.{0,40}\bquestions\b/i.test(normalized)) return { kind: 'short_answer' };
  return { kind: 'other' };
}

function findItemBlocks(text) {
  const lines = String(text || '').split(/\r?\n/), starts = [];
  let offset = 0;
  for (const line of lines) {
    const match = line.match(/^\s*\|?\s*(?:(\d+)\s*[.)]|\((\d+)\))\s+(.+)$/);
    if (match) starts.push({ offset, no: Number(match[1] || match[2]), line: match[3] });
    offset += line.length + 1;
  }
  if (!starts.length) return [];
  const source = String(text || '');
  return starts.map((start, index) => ({ no: start.no, rawText: source.slice(start.offset, starts[index + 1]?.offset ?? source.length).trim() }));
}

function parseMatchingRows(text) {
  const rows = tableRows(text), left = [], right = [];
  for (const row of rows) {
    const a = row.cells[0].match(/^\s*(\d+)\s*[.)]?\s*(.*)$/);
    const b = row.cells[1]?.match(/^\s*([a-h])\s*[.)]?\s*(.*)$/i);
    if (a && a[2].trim()) left.push({ no: Number(a[1]), text: a[2].trim() });
    if (b && b[2].trim()) right.push({ label: b[1].toLowerCase(), text: b[2].trim() });
    else if (a && row.cells[1]?.trim()) right.push({ label: String.fromCharCode(97 + right.length), text: row.cells[1].replace(/^\s*\d+\s*[.)]?\s*/, '').trim() });
  }
  return { left, right };
}

function parseExerciseItems(set) {
  const kind = set.kind || 'other', rawText = String(set.rawText || ''), instruction = String(set.instruction || '');
  let meta = set.kindMeta || classifyExerciseKind(instruction, rawText);
  if (kind === 'fill_blank') {
    const limitMatch = rawText.match(/\bno more than\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+words?\b/i);
    const bankLine = rawText.split(/\r?\n/).find(line => /\bwords?\s+in\s+the\s+box\b/i.test(line));
    const wordBank = bankLine ? bankLine.replace(/^.*?\bwords?\s+in\s+the\s+box\b\s*:?/i, '').split(/[,;|]/).map(value => value.trim()).filter(Boolean) : [];
    meta = { ...meta, kind, wordLimit: meta.wordLimit ?? (limitMatch ? wordCount(limitMatch[1]) : null), wordBank: meta.wordBank?.length ? meta.wordBank : wordBank };
  }
  if (kind === 'true_false') meta = { ...meta, kind, options: /\bnot given\b|\bt\/f\/ng\b/i.test(rawText) ? ['T', 'F', 'NG'] : (meta.options || ['T', 'F']) };
  const rows = tableRows(rawText);
  if (kind === 'matching') {
    const { left, right } = parseMatchingRows(rawText);
    if (left.length && right.length) return left.map(entry => ({ ...baseItem(set, kind, entry.no, entry.text), left, right }));
  }
  if (kind === 'definition_to_word' && rows.length) {
    const headerAt = rows.findIndex(row => /definitions?/i.test(row.cells.join(' ')) && /words?/i.test(row.cells.join(' ')));
    const header = headerAt >= 0 ? rows[headerAt].cells : [];
    const definitionColumn = header.findIndex(cell => /definitions?/i.test(cell));
    const wordColumn = header.findIndex(cell => /^words?$/i.test(cell));
    const dataRows = headerAt >= 0 ? rows.slice(headerAt + 1) : rows.filter(row => !/definitions?|words?/i.test(row.cells.join(' ')) || /^\s*\d+[.)]/.test(row.cells[0]));
    if (dataRows.length) return dataRows.map((row, index) => {
      const numbered = row.cells.map(cell => cell.match(/^\s*(\d+)\s*[.)]?\s*(.*)$/)).find(Boolean);
      const no = numbered ? Number(numbered[1]) : index + 1;
      const definition = (definitionColumn >= 0 ? row.cells[definitionColumn] : '') || row.cells.find((cell, i) => i !== wordColumn && !/^\s*(?:para(?:graph)?\.?\s*\d+|p\.?\s*\d+)\s*$/i.test(cell) && !/^\s*\d+\s*[.)]?\s*$/.test(cell)) || '';
      const hint = row.cells.find(cell => /^\s*(?:para(?:graph)?\.?\s*\d+|p\.?\s*\d+)\s*$/i.test(cell)) || '';
      const prompt = [hint, definition.replace(/^\s*\d+\s*[.)]?\s*/, '')].filter(Boolean).join(' · ');
      const word = wordColumn >= 0 ? row.cells[wordColumn] : row.cells.slice(1).find(cell => cell !== definition && cell !== hint) || '';
      return { ...baseItem(set, kind, no, prompt || row.cells.join(' · ')), hint, left: [{ no, text: prompt || row.cells.join(' · ') }], right: [{ label: '', text: word }] };
    });
  }
  if (kind === 'table_fill' && rows.length) {
    const grid = rows.map(row => row.cells), blanks = [];
    for (let row = 0; row < grid.length; row++) for (let column = 0; column < grid[row].length; column++) {
      if (/_{3,}|…{2,}|\.{3,}/.test(grid[row][column])) blanks.push({ row, column, prompt: grid[row][column] });
    }
    if (blanks.length) return blanks.map((blank, index) => ({ ...baseItem(set, kind, index + 1, `Ô hàng ${blank.row + 1}, cột ${blank.column + 1}`), grid, blanks: [blank] }));
  }
  const body = rawText.split(/\r?\n/).filter(line => !/^\s*(?:Task|Exercise)(?:\s*\*?\d+\*?)?\s*[:.]?/i.test(line)).join('\n');
  let blocks = findItemBlocks(body);
  if (kind === 'ipa_to_word' && !blocks.length) {
    const ipaItems = [...body.matchAll(/(?:\/[^/\r\n]{1,100}\/|\[[^\]\r\n]{1,100}\])/gu)].map((match, index) => ({ ...baseItem(set, kind, index + 1, match[0]), ipa: match[0] }));
    if (ipaItems.length) return ipaItems;
  }
  if (!blocks.length) blocks = [{ no: 1, rawText: body.trim() || rawText.trim() }];
  const matching = kind === 'matching' ? parseMatchingRows(rawText) : null;
  return blocks.map(block => {
    const parsed = parseOptions(block.rawText), text = parsed.prompt || block.rawText;
    const options = parsed.options.length ? parsed.options : (kind === 'multiple_choice' ? listOptions(block.rawText) : []);
    const prompt = String(text).replace(/^\s*(?:\d+\s*[.)]|\(\d+\))\s*/, '').trim();
    const item = { ...baseItem(set, kind, block.no, prompt), ...meta, kind };
    delete item.kindMeta;
    if (options.length) item.options = options;
    if (kind === 'true_false') item.options = meta.options || ['T', 'F'];
    if (kind === 'classify' && meta.options?.length) item.options = meta.options;
    if (kind === 'fill_blank') {
      const blankCount = [...block.rawText.matchAll(/_{3,}|…{2,}|\.{3,}/g)].length;
      item.blanks = Array.from({ length: blankCount }, (_, index) => ({ index: index + 1, answer: '' }));
    }
    if (kind === 'verb_form') item.hint = [...block.rawText.matchAll(/[([]([^\])]{1,80})[)\]]/g)].map(match => match[1].trim()).filter(Boolean);
    if (kind === 'matching' && matching?.left.length && matching?.right.length) { item.left = matching.left; item.right = matching.right; }
    return item;
  });
}

function baseItem(set, kind, no, prompt) {
  return {
    itemKey: `${set.unitId || 'unit'}:${set.setIndex}:${no}`,
    setIndex: set.setIndex,
    setTitle: set.title,
    section: set.section,
    rawText: set.rawText,
    instruction: set.instruction,
    kind,
    no,
    prompt: String(prompt || '').trim(),
    answer: '',
    answerStatus: 'none',
    answerCheck: null,
    evidence: '',
    page: set.page ?? null,
  };
}

function splitExerciseSets(text, section = 'tasks', firstSetIndex = 1, unitId = '') {
  const source = String(text || ''), markers = [];
  const re = /^[ \t]*(Task|Exercise)(?:[ \t]*\*?(\d+)\*?)?[ \t]*[:.]?[ \t]*(.*)$/gim;
  for (const match of source.matchAll(re)) {
    const number = match[2] ? Number(match[2]) : null;
    markers.push({ index: match.index, end: match.index + match[0].length, type: match[1], number, tail: match[3].trim(), line: match[0].trim() });
  }
  return markers.map((marker, index) => {
    const rawText = source.slice(marker.index, markers[index + 1]?.index ?? source.length).trim();
    const body = rawText.split(/\r?\n/).slice(1);
    const itemStarts = body.findIndex(line => /^\s*(?:\d+\s*[.)]|\(\d+\))\s+/.test(line) || /^\s*\|/.test(line));
    const continuation = itemStarts < 0 ? body : body.slice(0, itemStarts);
    const instruction = [marker.tail, ...continuation.map(line => line.trim()).filter(Boolean)].join(' ').trim();
    const setIndex = firstSetIndex + index;
    const set = { unitId, setIndex, title: `${marker.type}${marker.number ? ` ${marker.number}` : ''}`, instruction, rawText, section, page: null };
    const kindMeta = classifyExerciseKind(instruction, rawText);
    set.kind = kindMeta.kind;
    set.kindMeta = kindMeta;
    set.items = parseExerciseItems(set);
    return set;
  });
}

function normalizeIpa(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[\sˈˌ'’`´]/gu, '').replace(/[ː:]/gu, '').replace(/[()[\]{}]/g, '');
}

function findIpaGlossaryMatch(ipa, glossary = []) {
  const wanted = normalizeIpa(ipa);
  if (!wanted) return null;
  return (glossary || []).find(item => normalizeIpa(item.ipa) === wanted) || null;
}

function verifyExerciseAnswer(item, candidate, readingText = '', fullSource = '') {
  const answer = candidate?.answer;
  const evidence = String(candidate?.evidence || '').trim();
  const confidence = Number(candidate?.confidence);
  let answerText = Array.isArray(answer) ? answer.map(String) : typeof answer === 'string' ? answer.trim() : answer && typeof answer === 'object' ? answer : '';
  const source = String(fullSource || readingText || '');
  const verifiedEvidence = !!evidence && source.includes(evidence);
  const hasAnswer = Array.isArray(answerText) ? answerText.length > 0 && answerText.every(value => String(value).trim()) : answerText && typeof answerText === 'object' ? Object.keys(answerText).length > 0 : !!String(answerText || '').trim();
  let valid = !!hasAnswer && verifiedEvidence && Number.isFinite(confidence) && confidence >= 0.7;
  const norm = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase();
  if (item.kind === 'multiple_choice') {
    const allowed = item.options || [];
    const values = allowed.flatMap(option => typeof option === 'object' ? [option.label, option.text] : [option]);
    const answers = Array.isArray(answerText) ? answerText : [answerText];
    valid &&= answers.every(value => values.some(option => norm(option) === norm(value)));
  }
  if (item.kind === 'true_false') {
    const allowed = item.options || ['T', 'F'];
    const answers = Array.isArray(answerText) ? answerText : [answerText];
    const canonical = value => {
      const text = norm(value);
      if (['true', 'yes', 'correct'].includes(text)) return 't';
      if (['false', 'no', 'incorrect'].includes(text)) return 'f';
      if (['not given', 'not stated', 'cannot say', 'not mentioned'].includes(text)) return 'ng';
      return text;
    };
    valid &&= answers.every(value => allowed.some(option => canonical(option) === canonical(value)));
    if (valid) answerText = answers.map(canonical).join(' | ');
  }
  if (item.kind === 'matching') {
    const labels = new Set((item.right || []).map(option => norm(typeof option === 'object' ? option.label : option)));
    const pairs = Array.isArray(answerText) ? answerText : typeof answerText === 'object' ? Object.values(answerText) : [answerText];
    valid &&= pairs.length > 0 && pairs.every(value => labels.has(norm(typeof value === 'object' ? value.answer ?? value.label : value)));
  }
  if (item.kind === 'fill_blank') {
    const answers = Array.isArray(answerText) ? answerText : [answerText];
    if (item.blanks?.length) valid &&= answers.length === item.blanks.length;
    valid &&= answers.every(value => {
      const text = String(value || '').trim();
      const wordLimit = Number(item.wordLimit);
      const count = (text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).length;
      const reading = String(readingText || '').normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase();
      const normalizedAnswer = text.normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase();
      const inBank = !item.wordBank?.length || item.wordBank.some(word => norm(word) === norm(text));
      return !!text && reading.includes(normalizedAnswer) && inBank && (!wordLimit || count <= wordLimit);
    });
  }
  return {
    ...item,
    answer: answerText,
    evidence,
    answerStatus: valid ? 'verified_ai' : 'needs_review',
    answerConfidence: Number.isFinite(confidence) ? confidence : null,
    answerCheck: null,
  };
}

function gradeExerciseItems(items = [], answers = {}) {
  const scorable = new Set(['multiple_choice', 'true_false', 'fill_blank', 'verb_form', 'matching', 'definition_to_word', 'ipa_to_word']);
  const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const normalizeChoice = (value, options) => {
    const found = (options || []).find(entry => entry && typeof entry === 'object' && [entry.label, entry.text].some(candidate => normalize(candidate) === normalize(value)));
    return found?.label ?? value;
  };
  const results = (items || []).map(item => {
    const eligible = scorable.has(item.kind) && ['confirmed', 'verified_ai'].includes(item.answerStatus);
    const supplied = answers[item.itemKey] ?? '';
    const rawExpected = item.answer;
    let actualValues = Array.isArray(supplied) ? supplied : [supplied];
    let expectedValues = Array.isArray(rawExpected) ? rawExpected : [rawExpected];
    let reason = '';
    if (!eligible) reason = ['needs_review', 'none', undefined, null].includes(item.answerStatus) ? 'Chưa có đáp án đã kiểm chứng; câu này không tính điểm.' : 'Dạng bài này chưa hỗ trợ chấm tự động; câu này không tính điểm.';
    if (item.kind === 'multiple_choice') {
      expectedValues = expectedValues.map(value => normalizeChoice(value, item.options));
      actualValues = actualValues.map(value => normalizeChoice(value, item.options));
    } else if (item.kind === 'true_false') {
      const canonical = value => {
        const text = normalize(value);
        if (['t', 'true', 'yes', 'correct'].includes(text)) return 't';
        if (['f', 'false', 'no', 'incorrect'].includes(text)) return 'f';
        if (['ng', 'not given', 'not stated', 'cannot say', 'not mentioned'].includes(text)) return 'ng';
        return text;
      };
      actualValues = actualValues.map(canonical);
      expectedValues = expectedValues.map(canonical);
    } else if (item.kind === 'fill_blank') {
      actualValues = Array.isArray(supplied) ? supplied : (Array.isArray(rawExpected) && rawExpected.length > 1 ? String(supplied).split(/\s*[|;]\s*/) : [supplied]);
      expectedValues = Array.isArray(rawExpected) ? rawExpected : [rawExpected];
      const limit = Number(item.wordLimit) || 0;
      const exceeds = actualValues.some(value => limit > 0 && (String(value).trim().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).length > limit);
      if (exceeds) reason = `Một đáp án vượt quá giới hạn ${limit} từ.`;
    } else if (item.kind === 'matching') {
      const optionFor = value => (item.right || []).find(entry => entry && typeof entry === 'object' && [entry.label, entry.text].some(candidate => normalize(candidate) === normalize(value)))?.label ?? value;
      actualValues = actualValues.map(optionFor);
      expectedValues = expectedValues.map(value => optionFor(value && typeof value === 'object' ? value.answer ?? value.label ?? value.text : value));
    }
    const alternatives = value => String(value ?? '').split(/\s*(?:\/|\|)\s*/).map(normalize).filter(Boolean);
    const correct = eligible && !reason && actualValues.length === expectedValues.length && actualValues.every((value, index) => {const actual=normalize(value);return !!actual&&alternatives(expectedValues[index]).includes(actual)});
    return { itemKey: item.itemKey, no: item.no, kind: item.kind, setIndex: item.setIndex, setTitle: item.setTitle, origin: item._source === 'ai_generated' ? 'ai' : 'original', correct: eligible ? !!correct : null, score: eligible ? (correct ? 1 : 0) : null, expected: expectedValues, chosen: supplied, answerStatus: item.answerStatus || 'none', reason: reason || (!correct && eligible ? 'Đáp án chưa khớp.' : '') };
  });
  const graded = results.filter(item => item.correct !== null);
  const score = graded.filter(item => item.correct).length;
  return { score, total: graded.length, score10: graded.length ? Number((score / graded.length * 10).toFixed(2)) : 0, results };
}

function validateSimilarExerciseItems(generated = [], originalSet = {}, source = '') {
  const kind = originalSet.kind;
  if (!['multiple_choice', 'fill_blank'].includes(kind)) return { items: [], rejected: Array.isArray(generated) ? generated.length : 0 };
  const list = Array.isArray(generated) ? generated : [];
  const norm = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  const originals = new Set((originalSet.items || []).map(item => norm(item.prompt || item.rawText)).filter(Boolean));
  const seen = new Set();
  const items = [];
  for (const [index, rawCandidate] of list.slice(0, 5).entries()) {
    let candidate = rawCandidate;
    const prompt = String(candidate?.prompt || candidate?.question || '').trim().slice(0, 1200);
    const key = norm(prompt);
    const evidence = String(candidate?.evidence || '').trim().slice(0, 500);
    const explanation = String(candidate?.explanation || '').trim().slice(0, 1000);
    const answer = String(candidate?.answer ?? candidate?.answerText ?? '').trim().slice(0, 500);
    let options = Array.isArray(candidate?.options) ? candidate.options.slice(0, 6).map((option, optionIndex) => typeof option === 'object' && option ? { label: String(option.label || String.fromCharCode(97 + optionIndex)).trim().toLowerCase(), text: String(option.text || '').trim().slice(0, 300) } : { label: String.fromCharCode(97 + optionIndex), text: String(option).trim().slice(0, 300) }) : [];
    const evidenceFound = !!evidence && String(source).includes(evidence);
    let valid = !!prompt && !originals.has(key) && !seen.has(key) && evidenceFound && !!answer && !!explanation;
    if (kind === 'multiple_choice') {
      const optionKeys = options.map(option => norm(option.text));
      const answerLabel = String(candidate?.answerLabel || '').trim().toLowerCase();
      const answerIndex = Number.isInteger(candidate?.answerIndex) ? candidate.answerIndex : -1;
      const selected = options.find(option => option.label === answerLabel) || options[answerIndex];
      valid &&= options.length >= 3 && options.every(option => option.text) && new Set(optionKeys).size === optionKeys.length && !!selected && (norm(selected.label) === norm(answer) || norm(selected.text) === norm(answer));
      if (selected) { candidate = { ...candidate, answer: selected.label }; }
    } else {
      const sourceNormalized = norm(source), answerNormalized = norm(answer);
      valid &&= /_{3,}|…{2,}|\.{3,}/u.test(prompt) && !!answerNormalized && sourceNormalized.includes(answerNormalized) && (!Number(candidate?.wordLimit) || (answer.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).length <= Number(candidate.wordLimit));
    }
    if (!valid) continue;
    seen.add(key);
    const cleanAnswer = kind === 'multiple_choice' ? String(candidate.answer).trim().toLowerCase() : answer;
    items.push({
      kind, no: Number(candidate.no) || index + 1, prompt, options,
      answer: cleanAnswer, answerStatus: 'verified_ai', evidence, explanation, answerCheck: null,
      wordLimit: Number(candidate.wordLimit) || originalSet.wordLimit || null,
      wordBank: Array.isArray(candidate.wordBank) ? candidate.wordBank.map(String).slice(0, 30) : originalSet.wordBank || [],
    });
  }
  return { items, rejected: Math.max(0, list.length - items.length) };
}

module.exports = { classifyExerciseKind, splitExerciseSets, parseExerciseItems, tableRows, parseOptions, normalizeIpa, findIpaGlossaryMatch, verifyExerciseAnswer, gradeExerciseItems, validateSimilarExerciseItems };
