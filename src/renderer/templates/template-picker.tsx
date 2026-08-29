import { FileText, Plus, X } from 'lucide-react';

import type { ObjectKind } from '../../shared/object-contract';
import type { TemplateDefinition } from '../../shared/template-contract';
import type { Locale } from '../app/i18n';
import { Button } from '../ui/button';
import { FocusedOverlay } from '../ui/focused-overlay';
import { templateCopy } from './template-i18n';

type TemplatePickerProps = Readonly<{
  locale: Locale;
  objectKind: ObjectKind;
  onClose: () => void;
  onSelect: (template?: TemplateDefinition) => void;
  templates: readonly TemplateDefinition[];
}>;

export function TemplatePicker({
  locale,
  objectKind,
  onClose,
  onSelect,
  templates,
}: TemplatePickerProps) {
  const title =
    objectKind === 'item'
      ? templateCopy(locale, 'createItemWithTemplate')
      : templateCopy(locale, 'createPersonWithTemplate');

  return (
    <FocusedOverlay className="template-picker-dialog" labelId="template-picker-title" onClose={onClose}>
      <header className="dialog-header">
        <div>
          <p className="eyebrow">MAX · {templateCopy(locale, 'templates')}</p>
          <h2 id="template-picker-title">{title}</h2>
        </div>
        <button aria-label={templateCopy(locale, 'cancel')} className="icon-button" onClick={onClose} type="button">
          <X aria-hidden="true" size={19} />
        </button>
      </header>

      <div className="template-picker-grid" role="menu">
        {templates.map((template) => (
          <button
            key={template.id}
            className="template-picker-card"
            onClick={() => onSelect(template)}
            role="menuitem"
            type="button"
          >
            <div className="template-picker-card__icon">
              <FileText aria-hidden="true" size={22} />
            </div>
            <strong>{template.name}</strong>
            <small>
              {template.fieldOrder.length} {locale === 'ar' ? 'حقول مرتبة' : 'ordered fields'}
            </small>
          </button>
        ))}

        <button
          className="template-picker-card template-picker-card--blank"
          onClick={() => onSelect(undefined)}
          role="menuitem"
          type="button"
        >
          <div className="template-picker-card__icon">
            <Plus aria-hidden="true" size={22} />
          </div>
          <strong>{templateCopy(locale, 'customBlankRecord')}</strong>
          <small>{locale === 'ar' ? 'بدون قالب مسبق' : 'Without preset template'}</small>
        </button>
      </div>

      <footer className="dialog-footer">
        <Button onClick={onClose}>{templateCopy(locale, 'cancel')}</Button>
      </footer>
    </FocusedOverlay>
  );
}
