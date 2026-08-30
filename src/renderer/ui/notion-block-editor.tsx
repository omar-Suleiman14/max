import {
  Check,
  Columns,
  CreditCard,
  Database,
  FileText,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  Lightbulb,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Package,
  Plus,
  ReceiptText,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import React, { useRef, useState, type KeyboardEvent } from 'react';

import { AccountsWorkspace } from '../accounts/accounts-workspace';
import type { Locale } from '../app/i18n';
import { ObjectWorkspace } from '../objects/object-workspace';
import { ReconciliationWorkspace } from '../reconciliation/reconciliation-workspace';
import { TransactionsWorkspace } from '../transactions/transactions-workspace';

export type BlockType =
  | 'bullet'
  | 'callout'
  | 'columns'
  | 'database-view'
  | 'divider'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'number'
  | 'text'
  | 'todo';

export type NotionBlock = {
  calloutIcon?: string;
  checked?: boolean; // For todo items
  col1Blocks?: readonly NotionBlock[]; // For columns block (left)
  col2Blocks?: readonly NotionBlock[]; // For columns block (right)
  content: string;
  databaseKind?: 'accounts' | 'items' | 'people' | 'reconciliation' | 'transactions';
  id: string;
  type: BlockType;
};

type NotionBlockEditorProps = Readonly<{
  blocks: readonly NotionBlock[];
  locale: Locale;
  onChange: (blocks: readonly NotionBlock[]) => void;
  placeholder?: string;
}>;

type SlashOption = {
  category: 'basic' | 'database' | 'layout';
  description: string;
  descriptionAr: string;
  icon: LucideIcon;
  id: string;
  keywords: readonly string[];
  label: string;
  labelAr: string;
  run: (blockId: string) => void;
};

export function NotionBlockEditor({ blocks, locale, onChange }: NotionBlockEditorProps) {
  const [activeSlashBlockId, setActiveSlashBlockId] = useState<string | null>(null);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const inputRefs = useRef<Map<string, HTMLTextAreaElement | HTMLInputElement>>(new Map());

  // Focus management helper
  function focusBlock(id: string, cursorAtEnd = true) {
    setTimeout(() => {
      const el = inputRefs.current.get(id);
      if (el) {
        el.focus();
        if (cursorAtEnd) {
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      }
    }, 20);
  }

  function updateBlock(id: string, update: Partial<NotionBlock>) {
    onChange(
      blocks.map((b) => (b.id === id ? { ...b, ...update } : b)),
    );
  }

  function removeBlock(id: string) {
    const idx = blocks.findIndex((b) => b.id === id);
    const next = blocks.filter((b) => b.id !== id);
    if (next.length === 0) {
      const fallback: NotionBlock = { content: '', id: 'block_' + Math.random().toString(36).substring(2, 9), type: 'text' };
      onChange([fallback]);
      focusBlock(fallback.id);
    } else {
      onChange(next);
      const prevIdx = Math.max(0, idx - 1);
      if (next[prevIdx]) {
        focusBlock(next[prevIdx].id);
      }
    }
  }

  function insertBlockAfter(afterId: string, type: BlockType = 'text', content = ''): string {
    const idx = blocks.findIndex((b) => b.id === afterId);
    const newBlock: NotionBlock = {
      content,
      id: 'block_' + Math.random().toString(36).substring(2, 9),
      type,
    };
    const next = [...blocks];
    if (idx === -1) {
      next.push(newBlock);
    } else {
      next.splice(idx + 1, 0, newBlock);
    }
    onChange(next);
    focusBlock(newBlock.id);
    return newBlock.id;
  }

  // Handle markdown shortcut triggers: #, ##, ###, -, *, 1., [], >, ---, /2col
  function handleContentChange(id: string, text: string) {
    // Check for markdown shortcuts at line start
    if (text === '# ') {
      updateBlock(id, { content: '', type: 'h1' });
      setActiveSlashBlockId(null);
      return;
    }
    if (text === '## ') {
      updateBlock(id, { content: '', type: 'h2' });
      setActiveSlashBlockId(null);
      return;
    }
    if (text === '### ') {
      updateBlock(id, { content: '', type: 'h3' });
      setActiveSlashBlockId(null);
      return;
    }
    if (text === '- ' || text === '* ') {
      updateBlock(id, { content: '', type: 'bullet' });
      setActiveSlashBlockId(null);
      return;
    }
    if (text === '1. ') {
      updateBlock(id, { content: '', type: 'number' });
      setActiveSlashBlockId(null);
      return;
    }
    if (text === '[] ' || text === '[ ] ') {
      updateBlock(id, { checked: false, content: '', type: 'todo' });
      setActiveSlashBlockId(null);
      return;
    }
    if (text === '> ') {
      updateBlock(id, { calloutIcon: '💡', content: '', type: 'callout' });
      setActiveSlashBlockId(null);
      return;
    }
    if (text === '---') {
      updateBlock(id, { content: '', type: 'divider' });
      insertBlockAfter(id, 'text', '');
      setActiveSlashBlockId(null);
      return;
    }

    // Slash command trigger
    if (text.startsWith('/')) {
      setActiveSlashBlockId(id);
      setSlashQuery(text.substring(1));
      setSlashIndex(0);
    } else if (activeSlashBlockId === id) {
      setActiveSlashBlockId(null);
      setSlashQuery('');
    }

    updateBlock(id, { content: text });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, block: NotionBlock, index: number) {
    // If slash menu is open for this block
    if (activeSlashBlockId === block.id) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSlashIndex((prev) => (prev + 1) % filteredSlashOptions.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSlashIndex((prev) => (prev - 1 + filteredSlashOptions.length) % filteredSlashOptions.length);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const selected = filteredSlashOptions[slashIndex];
        if (selected) {
          selected.run(block.id);
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setActiveSlashBlockId(null);
        return;
      }
    }

    // Enter key: create a new text block directly below
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      // If pressing enter on an empty bullet/todo/number, transform it back to normal text
      if (!block.content.trim() && ['bullet', 'callout', 'h1', 'h2', 'h3', 'number', 'todo'].includes(block.type)) {
        updateBlock(block.id, { type: 'text' });
        return;
      }
      const nextType: BlockType = block.type === 'bullet' ? 'bullet' : block.type === 'todo' ? 'todo' : block.type === 'number' ? 'number' : 'text';
      insertBlockAfter(block.id, nextType);
      return;
    }

    // Backspace on empty block: delete and focus previous
    if (event.key === 'Backspace' && block.content === '') {
      if (block.type !== 'text') {
        event.preventDefault();
        updateBlock(block.id, { type: 'text' });
        return;
      }
      if (blocks.length > 1) {
        event.preventDefault();
        removeBlock(block.id);
        return;
      }
    }

    // Arrow Up / Down navigation
    if (event.key === 'ArrowUp' && index > 0) {
      const prevBlock = blocks[index - 1];
      if (prevBlock) {
        const input = inputRefs.current.get(block.id);
        if (input && input.selectionStart === 0) {
          event.preventDefault();
          focusBlock(prevBlock.id);
        }
      }
    }
    if (event.key === 'ArrowDown' && index < blocks.length - 1) {
      const nextBlock = blocks[index + 1];
      if (nextBlock) {
        const input = inputRefs.current.get(block.id);
        if (input && input.selectionStart === input.value.length) {
          event.preventDefault();
          focusBlock(nextBlock.id, false);
        }
      }
    }
  }

  // Slash options
  const slashOptions: readonly SlashOption[] = [
    // Basic Blocks
    {
      category: 'basic',
      description: 'Just start writing with plain text',
      descriptionAr: 'كتابة نص عادي بدون تنسيق',
      icon: FileText,
      id: 'text',
      keywords: ['text', 'paragraph', 'نص', 'فقرة', 'كتابة'],
      label: 'Text',
      labelAr: 'نص',
      run: (bId) => {
        updateBlock(bId, { content: '', type: 'text' });
        setActiveSlashBlockId(null);
        focusBlock(bId);
      },
    },
    {
      category: 'basic',
      description: 'Big section heading',
      descriptionAr: 'عنوان قسم رئيسي كبير',
      icon: Heading1,
      id: 'h1',
      keywords: ['h1', 'heading', 'title', 'عنوان', 'رئيسي', 'كبير'],
      label: 'Heading 1',
      labelAr: 'عنوان 1',
      run: (bId) => {
        updateBlock(bId, { content: '', type: 'h1' });
        setActiveSlashBlockId(null);
        focusBlock(bId);
      },
    },
    {
      category: 'basic',
      description: 'Medium section heading',
      descriptionAr: 'عنوان فرعي متوسط',
      icon: Heading2,
      id: 'h2',
      keywords: ['h2', 'subheading', 'عنوان', 'فرعي', 'متوسط'],
      label: 'Heading 2',
      labelAr: 'عنوان 2',
      run: (bId) => {
        updateBlock(bId, { content: '', type: 'h2' });
        setActiveSlashBlockId(null);
        focusBlock(bId);
      },
    },
    {
      category: 'basic',
      description: 'Small section heading',
      descriptionAr: 'عنوان فرعي صغير',
      icon: Heading3,
      id: 'h3',
      keywords: ['h3', 'small heading', 'عنوان', 'صغير'],
      label: 'Heading 3',
      labelAr: 'عنوان 3',
      run: (bId) => {
        updateBlock(bId, { content: '', type: 'h3' });
        setActiveSlashBlockId(null);
        focusBlock(bId);
      },
    },
    {
      category: 'basic',
      description: 'Track tasks with a to-do list',
      descriptionAr: 'قائمة مهام مع مربعات اختيار تفاعلية',
      icon: ListTodo,
      id: 'todo',
      keywords: ['todo', 'task', 'check', 'مهام', 'قائمة', 'مهمة', 'اختيار'],
      label: 'To-do list',
      labelAr: 'قائمة مهام',
      run: (bId) => {
        updateBlock(bId, { checked: false, content: '', type: 'todo' });
        setActiveSlashBlockId(null);
        focusBlock(bId);
      },
    },
    {
      category: 'basic',
      description: 'Create a simple bulleted list',
      descriptionAr: 'قائمة نقطية بسيطة',
      icon: List,
      id: 'bullet',
      keywords: ['bullet', 'list', 'نقطة', 'قائمة', 'عناصر'],
      label: 'Bulleted list',
      labelAr: 'قائمة نقطية',
      run: (bId) => {
        updateBlock(bId, { content: '', type: 'bullet' });
        setActiveSlashBlockId(null);
        focusBlock(bId);
      },
    },
    {
      category: 'basic',
      description: 'Create a numbered list',
      descriptionAr: 'قائمة مرقمة متسلسلة',
      icon: ListOrdered,
      id: 'number',
      keywords: ['number', 'ordered', 'ترقيم', 'أرقام', 'تسلسل'],
      label: 'Numbered list',
      labelAr: 'قائمة مرقمة',
      run: (bId) => {
        updateBlock(bId, { content: '', type: 'number' });
        setActiveSlashBlockId(null);
        focusBlock(bId);
      },
    },
    {
      category: 'basic',
      description: 'Make writing stand out with an icon',
      descriptionAr: 'ملاحظة مميزة مع رمز وخلفية هادئة',
      icon: Lightbulb,
      id: 'callout',
      keywords: ['callout', 'note', 'tip', 'ملاحظة', 'تنبيه', 'فكرة'],
      label: 'Callout',
      labelAr: 'ملاحظة مميزة',
      run: (bId) => {
        updateBlock(bId, { calloutIcon: '💡', content: '', type: 'callout' });
        setActiveSlashBlockId(null);
        focusBlock(bId);
      },
    },
    {
      category: 'basic',
      description: 'Visually divide blocks with a line',
      descriptionAr: 'خط فاصل بين الأقسام',
      icon: Minus,
      id: 'divider',
      keywords: ['divider', 'line', 'separator', 'فاصل', 'خط'],
      label: 'Divider',
      labelAr: 'فاصل',
      run: (bId) => {
        updateBlock(bId, { content: '', type: 'divider' });
        insertBlockAfter(bId, 'text', '');
        setActiveSlashBlockId(null);
      },
    },

    // Layout (2 Columns)
    {
      category: 'layout',
      description: 'Split into 2 side-by-side columns on the same line',
      descriptionAr: 'تقسيم الصفحة إلى عمودين متجاورين في نفس السطر',
      icon: Columns,
      id: 'columns',
      keywords: ['columns', '2 columns', 'split', 'side by side', 'عمودين', 'تقسيم', 'أعمدة'],
      label: '2 Columns',
      labelAr: 'عمودين متجاورين',
      run: (bId) => {
        updateBlock(bId, {
          col1Blocks: [{ content: '', id: 'col1_' + Math.random().toString(36).substring(2, 9), type: 'text' }],
          col2Blocks: [{ content: '', id: 'col2_' + Math.random().toString(36).substring(2, 9), type: 'text' }],
          content: '',
          type: 'columns',
        });
        setActiveSlashBlockId(null);
      },
    },

    // Databases
    {
      category: 'database',
      description: 'Live interactive Items & Inventory table',
      descriptionAr: 'جدول الأصناف والمخزون التفاعلي المباشر',
      icon: Package,
      id: 'db_items',
      keywords: ['items', 'products', 'inventory', 'stock', 'أصناف', 'منتجات', 'مخزون'],
      label: 'Database: Items',
      labelAr: 'قاعدة بيانات: الأصناف',
      run: (bId) => {
        updateBlock(bId, { content: '', databaseKind: 'items', type: 'database-view' });
        setActiveSlashBlockId(null);
      },
    },
    {
      category: 'database',
      description: 'Live Customers & Suppliers directory',
      descriptionAr: 'دليل العملاء والموردين التفاعلي المباشر',
      icon: Users,
      id: 'db_people',
      keywords: ['people', 'customers', 'suppliers', 'contacts', 'عملاء', 'موردين', 'أشخاص'],
      label: 'Database: People',
      labelAr: 'قاعدة بيانات: الأشخاص',
      run: (bId) => {
        updateBlock(bId, { content: '', databaseKind: 'people', type: 'database-view' });
        setActiveSlashBlockId(null);
      },
    },
    {
      category: 'database',
      description: 'Live Transactions & Invoices ledger',
      descriptionAr: 'سجل المعاملات والفواتير المباشر',
      icon: ReceiptText,
      id: 'db_transactions',
      keywords: ['transactions', 'sales', 'purchases', 'payments', 'معاملات', 'مبيعات', 'فواتير'],
      label: 'Database: Transactions',
      labelAr: 'قاعدة بيانات: المعاملات',
      run: (bId) => {
        updateBlock(bId, { content: '', databaseKind: 'transactions', type: 'database-view' });
        setActiveSlashBlockId(null);
      },
    },
    {
      category: 'database',
      description: 'Live Cash Accounts & Drawers',
      descriptionAr: 'الحسابات والخزائن المالية المباشرة',
      icon: CreditCard,
      id: 'db_accounts',
      keywords: ['accounts', 'drawers', 'cash', 'money', 'حسابات', 'خزائن', 'مال'],
      label: 'Database: Accounts',
      labelAr: 'قاعدة بيانات: الحسابات',
      run: (bId) => {
        updateBlock(bId, { content: '', databaseKind: 'accounts', type: 'database-view' });
        setActiveSlashBlockId(null);
      },
    },
  ];

  const filteredSlashOptions = slashOptions.filter((opt) => {
    if (!slashQuery) return true;
    const q = slashQuery.toLowerCase();
    return (
      opt.label.toLowerCase().includes(q) ||
      opt.labelAr.includes(q) ||
      opt.keywords.some((k) => k.toLowerCase().includes(q))
    );
  });

  // Drag-and-drop block reordering
  function handleDragStart(index: number) {
    setDraggedIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  }

  function handleDrop(targetIndex: number) {
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    const next = [...blocks];
    const [moved] = next.splice(draggedIndex, 1);
    if (moved) {
      next.splice(targetIndex, 0, moved);
      onChange(next);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  }

  return (
    <div className="notion-editor-canvas">
      {blocks.map((block, index) => {
        const isDragging = draggedIndex === index;
        const isDragOver = dragOverIndex === index;
        const isSlashActive = activeSlashBlockId === block.id;

        return (
          <div
            key={block.id}
            className="notion-block-row"
            data-drag-over={isDragOver}
            data-dragging={isDragging}
            data-type={block.type}
            onDragEnd={() => {
              setDraggedIndex(null);
              setDragOverIndex(null);
            }}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={() => handleDrop(index)}
          >
            {/* Gutter Handles (+ and Drag grip) - Hover Only */}
            <div className="notion-block-gutter">
              <button
                aria-label="Add block below"
                className="notion-gutter-btn notion-gutter-btn--add"
                onClick={() => insertBlockAfter(block.id)}
                title={locale === 'ar' ? 'إضافة سطر' : 'Add line below'}
                type="button"
              >
                <Plus size={14} />
              </button>
              <button
                aria-label="Drag to move"
                className="notion-gutter-btn notion-gutter-btn--drag"
                draggable
                onDragStart={() => handleDragStart(index)}
                title={locale === 'ar' ? 'سحب للترتيب' : 'Drag to reorder'}
                type="button"
              >
                <GripVertical size={14} />
              </button>
            </div>

            {/* Block Body */}
            <div className="notion-block-body">
              {block.type === 'text' && (
                <textarea
                  ref={(el) => {
                    if (el) inputRefs.current.set(block.id, el);
                    else inputRefs.current.delete(block.id);
                  }}
                  className="notion-text-input"
                  onChange={(e) => handleContentChange(block.id, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, block, index)}
                  placeholder={
                    index === 0
                      ? locale === 'ar'
                        ? "اكتب شيئاً، أو اكتب '/' للأوامر..."
                        : "Type something, or press '/' for commands..."
                      : ''
                  }
                  rows={1}
                  value={block.content}
                />
              )}

              {block.type === 'h1' && (
                <input
                  ref={(el) => {
                    if (el) inputRefs.current.set(block.id, el);
                    else inputRefs.current.delete(block.id);
                  }}
                  className="notion-heading-input notion-heading-input--h1"
                  onChange={(e) => handleContentChange(block.id, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, block, index)}
                  placeholder={locale === 'ar' ? 'عنوان 1...' : 'Heading 1...'}
                  value={block.content}
                />
              )}

              {block.type === 'h2' && (
                <input
                  ref={(el) => {
                    if (el) inputRefs.current.set(block.id, el);
                    else inputRefs.current.delete(block.id);
                  }}
                  className="notion-heading-input notion-heading-input--h2"
                  onChange={(e) => handleContentChange(block.id, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, block, index)}
                  placeholder={locale === 'ar' ? 'عنوان 2...' : 'Heading 2...'}
                  value={block.content}
                />
              )}

              {block.type === 'h3' && (
                <input
                  ref={(el) => {
                    if (el) inputRefs.current.set(block.id, el);
                    else inputRefs.current.delete(block.id);
                  }}
                  className="notion-heading-input notion-heading-input--h3"
                  onChange={(e) => handleContentChange(block.id, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, block, index)}
                  placeholder={locale === 'ar' ? 'عنوان 3...' : 'Heading 3...'}
                  value={block.content}
                />
              )}

              {block.type === 'todo' && (
                <div className="notion-todo-wrap">
                  <button
                    aria-checked={Boolean(block.checked)}
                    aria-label="Toggle task"
                    className="notion-todo-checkbox"
                    data-checked={Boolean(block.checked)}
                    onClick={() => updateBlock(block.id, { checked: !block.checked })}
                    type="button"
                  >
                    {block.checked && <Check size={13} strokeWidth={3} />}
                  </button>
                  <input
                    ref={(el) => {
                      if (el) inputRefs.current.set(block.id, el);
                      else inputRefs.current.delete(block.id);
                    }}
                    className="notion-todo-input"
                    data-checked={Boolean(block.checked)}
                    onChange={(e) => handleContentChange(block.id, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, block, index)}
                    placeholder={locale === 'ar' ? 'مهمة...' : 'To-do item...'}
                    value={block.content}
                  />
                </div>
              )}

              {block.type === 'bullet' && (
                <div className="notion-bullet-wrap">
                  <span className="notion-bullet-dot" />
                  <input
                    ref={(el) => {
                      if (el) inputRefs.current.set(block.id, el);
                      else inputRefs.current.delete(block.id);
                    }}
                    className="notion-bullet-input"
                    onChange={(e) => handleContentChange(block.id, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, block, index)}
                    placeholder={locale === 'ar' ? 'عنصر قائمة...' : 'List item...'}
                    value={block.content}
                  />
                </div>
              )}

              {block.type === 'number' && (
                <div className="notion-number-wrap">
                  <span className="notion-number-prefix">{index + 1}.</span>
                  <input
                    ref={(el) => {
                      if (el) inputRefs.current.set(block.id, el);
                      else inputRefs.current.delete(block.id);
                    }}
                    className="notion-number-input"
                    onChange={(e) => handleContentChange(block.id, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, block, index)}
                    placeholder={locale === 'ar' ? 'عنصر مرقم...' : 'List item...'}
                    value={block.content}
                  />
                </div>
              )}

              {block.type === 'callout' && (
                <div className="notion-callout-card">
                  <span className="notion-callout-icon">{block.calloutIcon || '💡'}</span>
                  <textarea
                    ref={(el) => {
                      if (el) inputRefs.current.set(block.id, el);
                      else inputRefs.current.delete(block.id);
                    }}
                    className="notion-callout-input"
                    onChange={(e) => handleContentChange(block.id, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, block, index)}
                    placeholder={locale === 'ar' ? 'ملاحظة هامة...' : 'Callout note...'}
                    rows={1}
                    value={block.content}
                  />
                </div>
              )}

              {block.type === 'divider' && (
                <div className="notion-divider-wrap">
                  <hr className="notion-divider" />
                </div>
              )}

              {/* 2-Column Side-by-Side Block */}
              {block.type === 'columns' && (
                <div className="notion-columns-container">
                  <div className="notion-column notion-column--1">
                    <NotionBlockEditor
                      blocks={
                        block.col1Blocks && block.col1Blocks.length > 0
                          ? block.col1Blocks
                          : [{ content: '', id: 'c1_' + Math.random().toString(36).substring(2, 7), type: 'text' }]
                      }
                      locale={locale}
                      onChange={(nextCol1) => updateBlock(block.id, { col1Blocks: nextCol1 })}
                    />
                  </div>
                  <div className="notion-column notion-column--2">
                    <NotionBlockEditor
                      blocks={
                        block.col2Blocks && block.col2Blocks.length > 0
                          ? block.col2Blocks
                          : [{ content: '', id: 'c2_' + Math.random().toString(36).substring(2, 7), type: 'text' }]
                      }
                      locale={locale}
                      onChange={(nextCol2) => updateBlock(block.id, { col2Blocks: nextCol2 })}
                    />
                  </div>
                </div>
              )}

              {/* Embedded Live Database View */}
              {block.type === 'database-view' && (
                <div className="notion-embedded-db-card">
                  <div className="notion-embedded-db-header">
                    <div className="notion-embedded-db-title">
                      <Database size={16} />
                      <span>
                        {block.databaseKind === 'items'
                          ? locale === 'ar' ? 'قاعدة بيانات: الأصناف' : 'Database: Items'
                          : block.databaseKind === 'people'
                            ? locale === 'ar' ? 'قاعدة بيانات: الأشخاص' : 'Database: People'
                            : block.databaseKind === 'transactions'
                              ? locale === 'ar' ? 'قاعدة بيانات: المعاملات' : 'Database: Transactions'
                              : block.databaseKind === 'accounts'
                                ? locale === 'ar' ? 'قاعدة بيانات: الحسابات' : 'Database: Accounts'
                                : locale === 'ar' ? 'المطابقة اليومية' : 'Daily Reconciliation'}
                      </span>
                    </div>

                    <div className="notion-embedded-db-actions">
                      <select
                        aria-label="Switch Database"
                        className="notion-db-switch-select"
                        onChange={(e) =>
                          updateBlock(block.id, {
                            databaseKind: e.target.value as NotionBlock['databaseKind'],
                          })
                        }
                        value={block.databaseKind || 'items'}
                      >
                        <option value="items">{locale === 'ar' ? 'الأصناف' : 'Items'}</option>
                        <option value="people">{locale === 'ar' ? 'الأشخاص' : 'People'}</option>
                        <option value="transactions">{locale === 'ar' ? 'المعاملات' : 'Transactions'}</option>
                        <option value="accounts">{locale === 'ar' ? 'الحسابات' : 'Accounts'}</option>
                        <option value="reconciliation">{locale === 'ar' ? 'المطابقة' : 'Reconciliation'}</option>
                      </select>

                      <button
                        aria-label={locale === 'ar' ? 'حذف العرض' : 'Remove view'}
                        className="notion-embedded-db-delete-btn"
                        onClick={() => removeBlock(block.id)}
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="notion-embedded-db-content">
                    {block.databaseKind === 'items' ? (
                      <ObjectWorkspace createRequest={0} locale={locale} objectKind="item" />
                    ) : block.databaseKind === 'people' ? (
                      <ObjectWorkspace createRequest={0} locale={locale} objectKind="person" />
                    ) : block.databaseKind === 'transactions' ? (
                      <TransactionsWorkspace createRequest={0} locale={locale} />
                    ) : block.databaseKind === 'accounts' ? (
                      <AccountsWorkspace createRequest={0} locale={locale} />
                    ) : (
                      <ReconciliationWorkspace locale={locale} />
                    )}
                  </div>
                </div>
              )}

              {/* Floating Slash Menu Palette */}
              {isSlashActive && (
                <div className="notion-slash-menu" role="menu">
                  <div className="notion-slash-menu__header">
                    <span>{locale === 'ar' ? 'القوالب والأوامر' : 'BASIC BLOCKS & VIEWS'}</span>
                    <kbd>ESC</kbd>
                  </div>
                  <div className="notion-slash-menu__list">
                    {filteredSlashOptions.length > 0 ? (
                      filteredSlashOptions.map((opt, optIdx) => {
                        const Icon = opt.icon;
                        const isSelected = optIdx === slashIndex;
                        return (
                          <button
                            key={opt.id}
                            className="notion-slash-item"
                            data-selected={isSelected}
                            onClick={() => opt.run(block.id)}
                            onMouseEnter={() => setSlashIndex(optIdx)}
                            type="button"
                          >
                            <div className="notion-slash-item__icon">
                              <Icon size={16} />
                            </div>
                            <div className="notion-slash-item__info">
                              <strong>{locale === 'ar' ? opt.labelAr : opt.label}</strong>
                              <small>{locale === 'ar' ? opt.descriptionAr : opt.description}</small>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="notion-slash-empty">
                        <p>{locale === 'ar' ? 'لا توجد نتائج' : 'No results found'}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Bottom click-to-add row */}
      <div
        className="notion-canvas-bottom-click-target"
        onClick={() => {
          if (blocks.length === 0 || blocks[blocks.length - 1]?.content.trim() !== '') {
            insertBlockAfter(blocks[blocks.length - 1]?.id || '', 'text', '');
          }
        }}
      />
    </div>
  );
}
