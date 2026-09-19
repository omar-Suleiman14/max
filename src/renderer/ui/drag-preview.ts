/** Use the content being moved, rather than the tiny drag handle, as the ghost. */
export function setDragPreview(data: DataTransfer, element: HTMLElement, count = 1): void {
  if (typeof data.setDragImage !== 'function') return;
  const preview = document.createElement('div');
  preview.className = 'workspace-drag-preview';
  preview.setAttribute('aria-hidden', 'true');
  preview.style.width = `${Math.min(480, Math.max(160, element.getBoundingClientRect().width))}px`;
  const copy = element.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
  copy.removeAttribute('id'); copy.removeAttribute('data-dragging');
  preview.append(copy);
  if (count > 1) { const badge = document.createElement('span'); badge.className = 'workspace-drag-preview__count'; badge.textContent = String(count); preview.append(badge); }
  document.body.append(preview);
  data.setDragImage(preview, 24, 20);
  setTimeout(() => preview.remove(), 0);
}

export function autoScrollDuringDrag(element: HTMLElement, clientY: number): void {
  for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
    if (parent.scrollHeight <= parent.clientHeight || !/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) continue;
    const rect = parent.getBoundingClientRect();
    if (clientY < rect.top + 40) parent.scrollTop -= 18;
    else if (clientY > rect.bottom - 40) parent.scrollTop += 18;
    return;
  }
}
