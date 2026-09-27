import type { KeyboardEvent } from 'react';

/**
 * The keys every Max popup list answers the same way, from the text box that
 * owns it: Up and Down move through the list and wrap, Enter chooses the
 * highlighted row, and typing narrows the list. Escape is handled by the
 * overlay, which closes and returns focus to where it was. Keys typed while an
 * input method is composing (Arabic, CJK) belong to the composition.
 */
export function handleListboxKey(
  event: KeyboardEvent<HTMLInputElement>,
  list: Readonly<{ activeIndex: number; count: number; onActiveChange: (index: number) => void; onChoose: (index: number) => void }>,
): boolean {
  if (event.nativeEvent.isComposing) return false;
  const { activeIndex, count } = list;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (count > 0) list.onActiveChange((activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + count) % count);
    return true;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    if (count > 0) list.onChoose(activeIndex);
    return true;
  }
  return false;
}

/** The sentence the popups announce when their list changes. */
export function resultCountMessage(count: number, locale: 'ar' | 'en'): string {
  if (locale === 'ar') return count === 0 ? 'لا توجد نتائج' : count === 1 ? 'نتيجة واحدة' : `${count} نتائج`;
  return count === 0 ? 'No results' : count === 1 ? '1 result' : `${count} results`;
}
