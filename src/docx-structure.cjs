'use strict';

const { DOMParser } = require('@xmldom/xmldom');

const SHORT_HEADING = /^[A-Z]\.\s+[A-Z][A-Z ]+$/;
const BLOCK_TAGS = new Set(['p', 'div', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

function tagName(node) {
  return node?.nodeType === 1 ? String(node.tagName || '').toLowerCase() : '';
}

function childrenOf(node) {
  return Array.from(node?.childNodes || []);
}

function normalizeText(value) {
  return String(value || '')
    .replace(/(?:\.{3,}|…{2,}|_{3,}|[-‐‑‒–—]{3,})/g, '____')
    .replace(/[\s\u00a0]+/g, ' ')
    .trim();
}

function plainText(node) {
  if (node?.nodeType === 3 || node?.nodeType === 4) return node.nodeValue || '';
  if (tagName(node) === 'img') return '';
  return childrenOf(node).map(plainText).join('');
}

function hasTag(node, target) {
  if (tagName(node) === target) return true;
  return childrenOf(node).some(child => hasTag(child, target));
}

function rowsOf(table) {
  const rows = [];
  function collect(container) {
    for (const child of childrenOf(container)) {
      const tag = tagName(child);
      if (tag === 'tr') rows.push(child);
      else if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') collect(child);
    }
  }
  collect(table);
  return rows;
}

function cellsOf(row) {
  return childrenOf(row).filter(child => tagName(child) === 'td' || tagName(child) === 'th');
}

function htmlToStructuredText(html) {
  const input = String(html || '');
  const document = new DOMParser().parseFromString(
    '<html><body><meai-root>' + input + '</meai-root></body></html>',
    'text/html',
  );
  const root = document.getElementsByTagName('meai-root').item(0);
  if (!root) throw new Error('Không đọc được cấu trúc HTML của DOCX.');

  const output = [];
  let imageNumber = 0;

  function inlineText(node) {
    if (node?.nodeType === 3 || node?.nodeType === 4) return node.nodeValue || '';
    const tag = tagName(node);
    if (tag === 'img') return '[HÌNH ' + (++imageNumber) + ']';
    if (tag === 'br') return ' ';
    if (tag === 'script' || tag === 'style') return '';
    return childrenOf(node).map(inlineText).join('');
  }

  function isBoldShortHeading(paragraph) {
    const meaningful = childrenOf(paragraph).filter(node =>
      node.nodeType !== 3 || String(node.nodeValue || '').trim(),
    );
    if (meaningful.length !== 1) return false;
    const tag = tagName(meaningful[0]);
    return (tag === 'strong' || tag === 'b') && SHORT_HEADING.test(normalizeText(plainText(meaningful[0])));
  }

  function listItemParts(item) {
    const segments = [];
    const nested = [];
    let pending = '';

    function flushPending() {
      const value = normalizeText(pending);
      if (value) segments.push(value);
      pending = '';
    }

    for (const child of childrenOf(item)) {
      const tag = tagName(child);
      if (tag === 'ol' || tag === 'ul') {
        flushPending();
        nested.push(child);
      } else if (BLOCK_TAGS.has(tag)) {
        flushPending();
        const value = normalizeText(inlineText(child));
        if (value) segments.push(value);
      } else {
        pending += inlineText(child);
      }
    }
    flushPending();
    return { text: segments.join(' / '), nested };
  }

  function renderList(list, depth = 0) {
    const ordered = tagName(list) === 'ol';
    const items = childrenOf(list).filter(child => tagName(child) === 'li');
    const rendered = [];
    items.forEach((item, index) => {
      const parts = listItemParts(item);
      if (parts.text) {
        const marker = ordered ? String(index + 1) + '. ' : '- ';
        rendered.push('  '.repeat(depth) + marker + parts.text);
      }
      for (const nested of parts.nested) rendered.push(...renderList(nested, depth + 1));
    });
    return rendered;
  }

  function cellText(cell) {
    const chunks = [];
    let pending = '';

    function flushPending() {
      const value = normalizeText(pending);
      if (value) chunks.push(value);
      pending = '';
    }

    for (const child of childrenOf(cell)) {
      const tag = tagName(child);
      if (tag === 'ol' || tag === 'ul') {
        flushPending();
        const listText = renderList(child).join(' / ');
        if (listText) chunks.push(listText);
      } else if (BLOCK_TAGS.has(tag)) {
        flushPending();
        const value = normalizeText(inlineText(child));
        if (value) chunks.push(value);
      } else {
        pending += inlineText(child);
      }
    }
    flushPending();
    return chunks.join(' / ');
  }

  function renderRow(row) {
    const cells = cellsOf(row).map(cellText);
    return '|' + cells.map(value => value ? ' ' + value + ' ' : '').join('|') + '|';
  }

  function renderTable(table) {
    const rows = rowsOf(table);
    if (!rows.length) return;

    if (rows.length === 1) {
      const cells = cellsOf(rows[0]);
      if (cells.length === 1 && !hasTag(cells[0], 'img')) {
        const heading = normalizeText(plainText(cells[0]));
        if (SHORT_HEADING.test(heading)) {
          output.push('## ' + heading);
          return;
        }
      }
    }

    output.push('[BẢNG]');
    for (const row of rows) {
      if (cellsOf(row).length) output.push(renderRow(row));
    }
    output.push('[/BẢNG]');
  }

  function walk(node) {
    for (const child of childrenOf(node)) {
      const tag = tagName(child);
      if (!tag) {
        if (child.nodeType === 3 || child.nodeType === 4) {
          const value = normalizeText(child.nodeValue);
          if (value) output.push(value);
        }
        continue;
      }

      if (/^h[1-6]$/.test(tag)) {
        const value = normalizeText(inlineText(child));
        if (value) output.push('## ' + value);
      } else if (tag === 'p') {
        const value = normalizeText(inlineText(child));
        if (!value) continue;
        output.push(isBoldShortHeading(child) ? '## ' + value : value);
      } else if (tag === 'ol' || tag === 'ul') {
        output.push(...renderList(child));
      } else if (tag === 'table') {
        renderTable(child);
      } else if (tag === 'img') {
        output.push(inlineText(child));
      } else if (tag !== 'script' && tag !== 'style') {
        walk(child);
      }
    }
  }

  walk(root);
  return output.join('\n');
}

module.exports = { htmlToStructuredText };
