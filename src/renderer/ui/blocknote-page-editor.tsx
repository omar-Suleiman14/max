import type { Block, PartialBlock } from '@blocknote/core';
import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import '@blocknote/react/style.css';
import { useRef } from 'react';

import type { Locale } from '../app/i18n';
import type { NotionBlock } from './notion-block-editor';

type Props = Readonly<{
  blocks: readonly NotionBlock[];
  locale: Locale;
  onChange: (blocks: readonly NotionBlock[]) => void;
}>;

function typeFor(block: NotionBlock): PartialBlock['type'] {
  if (block.type === 'h1' || block.type === 'h2' || block.type === 'h3') return 'heading';
  if (block.type === 'bullet') return 'bulletListItem';
  if (block.type === 'number') return 'numberedListItem';
  if (block.type === 'todo') return 'checkListItem';
  return 'paragraph';
}

function toBlockNote(blocks: readonly NotionBlock[]): PartialBlock[] {
  return blocks.map((block) => ({
    content: block.content,
    id: block.id,
    props: block.type === 'todo' ? { checked: Boolean(block.checked) }
      : block.type === 'h1' || block.type === 'h2' || block.type === 'h3' ? { level: Number(block.type.slice(1)) }
        : {},
    type: typeFor(block),
  })) as PartialBlock[];
}

function textFrom(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const entries: readonly unknown[] = content;
  return entries.map((item) => item && typeof item === 'object' && 'text' in item && typeof item.text === 'string' ? item.text : '').join('');
}

function fromBlockNote(blocks: readonly Block[]): readonly NotionBlock[] {
  return blocks.map((block): NotionBlock => {
    const props = block.props as Readonly<Record<string, unknown>>;
    const type = block.type;
    return {
      checked: type === 'checkListItem' ? Boolean(props.checked) : undefined,
      content: textFrom(block.content),
      id: block.id,
      type: type === 'heading' ? `h${typeof props.level === 'number' ? props.level : 1}` as NotionBlock['type']
        : type === 'bulletListItem' ? 'bullet'
          : type === 'numberedListItem' ? 'number'
            : type === 'checkListItem' ? 'todo'
              : 'text',
    };
  });
}

/** The BlockNote UI is a desktop adapter; it never owns the persisted format. */
export function BlockNotePageEditor({ blocks, locale, onChange }: Props) {
  const initialContent = useRef<PartialBlock[] | undefined>(undefined);
  if (!initialContent.current) initialContent.current = toBlockNote(blocks);
  const sideMenuAvailable = typeof document !== 'undefined' && typeof document.elementFromPoint === 'function';
  const editor = useCreateBlockNote({ disableExtensions: sideMenuAvailable ? [] : ['sideMenu'], initialContent: initialContent.current });
  return <div className="blocknote-page-editor" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <BlockNoteView
      editor={editor}
      onChange={() => onChange(fromBlockNote(editor.document))}
      // jsdom has no hit testing. The real desktop renderer does, so it keeps
      // BlockNote's drag side menu while unit tests use the same editor core.
      sideMenu={sideMenuAvailable}
    />
  </div>;
}
