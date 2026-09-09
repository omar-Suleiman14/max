import { safeWebUrl } from '../../shared/page-links';
export function escapeText(text: string) { return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function basic(text: string) {
  return escapeText(text).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^\w*])\*([^*]+)\*(?=[^\w*]|$)/g, '$1<em>$2</em>').replace(/(^|[^\w_])_([^_]+)_(?=[^\w_]|$)/g, '$1<em>$2</em>').replace(/~~([^~]+)~~/g, '<del>$1</del>').replace(/\+\+([^+]+)\+\+/g, '<u>$1</u>').replace(/==([^=]+)==/g, '<mark>$1</mark>');
}
export function renderInline(text: string): string {
  let html = '', position = 0;
  for (const match of text.matchAll(/\[([^\]]+)\]\(([^\s)]+)\)/g)) {
    html += basic(text.slice(position, match.index));
    const destination = match[2]!;
    if (destination.startsWith('max-page:')) {
      try { html += `<a href="#" contenteditable="false" data-page-id="${escapeText(decodeURIComponent(destination.slice(9)))}">${basic(match[1]!)}</a>`; } catch { html += basic(match[0]); }
    } else {
      const url = safeWebUrl(destination);
      html += url ? `<a href="${escapeText(url)}" contenteditable="false">${basic(match[1]!)}</a>` : basic(match[0]);
    }
    position = match.index + match[0].length;
  }
  return html + basic(text.slice(position)) || '&#8203;';
}
