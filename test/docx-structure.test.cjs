'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { htmlToStructuredText } = require('../src/docx-structure.cjs');

test('formats headings and a one-cell table heading', () => {
  const html = [
    '<h1>UNIT 1</h1>',
    '<p><strong>A. STARTER</strong></p>',
    '<table><tr><td><p><strong>F. GLOSSARY</strong></p></td></tr></table>',
  ].join('');

  assert.equal(htmlToStructuredText(html), '## UNIT 1\n## A. STARTER\n## F. GLOSSARY');
});

test('keeps glossary columns, joins paragraphs in cells, and preserves empty cells', () => {
  const html = [
    '<table><tr><td><p>1. message</p><p>message</p></td>',
    '<td>(n)</td><td>/ˈmɛsɪʤ/</td><td>bản tin</td></tr>',
    '<tr><td>left</td><td></td><td>right</td></tr></table>',
  ].join('');

  assert.equal(
    htmlToStructuredText(html),
    '[BẢNG]\n| 1. message / message | (n) | /ˈmɛsɪʤ/ | bản tin |\n| left || right |\n[/BẢNG]',
  );
});

test('numbers ordered lists in matching tables and supports nested lists', () => {
  const html = [
    '<table><tr><td><ol><li>insert</li><li>message</li></ol></td><td>Match the columns</td></tr></table>',
    '<ol><li>Main<ul><li>Child</li><li>Other</li></ul></li>',
    '<li>Second<ol><li>Nested ordered</li></ol></li></ol>',
  ].join('');

  assert.equal(
    htmlToStructuredText(html),
    '[BẢNG]\n| 1. insert / 2. message | Match the columns |\n[/BẢNG]\n1. Main\n  - Child\n  - Other\n2. Second\n  1. Nested ordered',
  );
});

test('keeps image positions and normalizes blank placeholders', () => {
  const html = '<p>Before <img alt="one"/> after</p><p><img alt="two"/></p>' +
    '<p>Fill …… / .... / ____ and --- now</p>';

  assert.equal(
    htmlToStructuredText(html),
    'Before [HÌNH 1] after\n[HÌNH 2]\nFill ____ / ____ / ____ and ____ now',
  );
});
