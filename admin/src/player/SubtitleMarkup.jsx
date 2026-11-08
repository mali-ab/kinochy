import { useMemo } from 'react';

const allowedTags = new Set(['b', 'i', 'u', 'em', 'strong', 'ruby', 'rt', 'br', 'span']);
const discardedTags = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template']);

/** Render subtitle formatting while stripping attributes and unsafe elements. */
export default function SubtitleMarkup({ text }) {
  const html = useMemo(() => sanitizeSubtitleMarkup(text), [text]);
  return <span className="subtitle-markup" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function hasSubtitleMarkup(text) {
  return /<\/?[a-z][^>]*>/i.test(String(text ?? ''));
}

function sanitizeSubtitleMarkup(value) {
  const source = String(value ?? '');
  if (typeof document === 'undefined') return escapeHtml(source);

  const template = document.createElement('template');
  template.innerHTML = source;
  const output = document.createElement('span');

  function copyChildren(sourceNode, targetNode) {
    for (const child of sourceNode.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        targetNode.appendChild(document.createTextNode(child.nodeValue || ''));
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;

      const name = child.localName.toLowerCase();
      if (discardedTags.has(name)) continue;
      const tag = allowedTags.has(name) ? name : name === 'c' || name === 'v' || name === 'lang' || name.startsWith('c.') ? 'span' : null;
      if (!tag) {
        copyChildren(child, targetNode);
        continue;
      }

      const safeElement = document.createElement(tag);
      copyChildren(child, safeElement);
      targetNode.appendChild(safeElement);
    }
  }

  copyChildren(template.content, output);
  return output.innerHTML;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}
