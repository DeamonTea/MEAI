'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanPageText, splitUnits } = require('../src/core.cjs');

test('cleanPageText leaves structured table and heading lines intact', () => {
  const text = '## F. GLOSSARY\n| 1. message | (n) || bản tin |';
  assert.equal(cleanPageText(text), text);
});

test('repeated-header filtering skips structured rows and headings', () => {
  const pages = [1, 2, 3].map(page => ({
    page,
    text: [
      'Running header',
      '## F. GLOSSARY',
      '| 1. message | (n) | /ˈmɛsɪʤ/ | bản tin |',
      'Paragraph ' + page + ': ' + 'short self-written sample text. '.repeat(8),
    ].join('\n'),
  }));

  const units = splitUnits(pages);
  assert.equal(units.length, 1);
  assert.equal((units[0].source.match(/## F\. GLOSSARY/g) || []).length, 3);
  assert.equal((units[0].source.match(/\| 1\. message \|/g) || []).length, 3);
  assert.equal(units[0].source.includes('Running header'), false);
});
