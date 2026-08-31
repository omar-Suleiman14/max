import {
  ArrowLeftRight,
  BadgeDollarSign,
  BanknoteArrowDown,
  BanknoteArrowUp,
  Calculator,
  ReceiptText,
  ShoppingCart,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import type { TransactionType } from '../../shared/transaction-contract';
import type { Locale } from '../app/i18n';
import { FocusedOverlay } from '../ui/focused-overlay';

export type TransactionChoice = 'quick-sale' | Exclude<TransactionType, 'reversal'>;

type TransactionChooserProps = Readonly<{
  locale: Locale;
  onChoose: (choice: TransactionChoice) => void;
  onClose: () => void;
}>;

const choices: readonly Readonly<{
  descriptionAr: string;
  descriptionEn: string;
  icon: LucideIcon;
  id: TransactionChoice;
  labelAr: string;
  labelEn: string;
}>[] = [
  { descriptionAr: 'تسجيل سريع: الصنف ← المبلغ ← طريقة الدفع', descriptionEn: 'Fast Product → Amount → Method flow', icon: Zap, id: 'quick-sale', labelAr: 'بيع سريع', labelEn: 'Quick sale' },
  { descriptionAr: 'فاتورة بيع كاملة مع عميل وصنف', descriptionEn: 'Full sale with item and customer details', icon: ReceiptText, id: 'sale', labelAr: 'بيع', labelEn: 'Sale' },
  { descriptionAr: 'شراء مخزون من مورد', descriptionEn: 'Stock purchase from a supplier', icon: ShoppingCart, id: 'purchase', labelAr: 'شراء', labelEn: 'Purchase' },
  { descriptionAr: 'تكلفة تشغيلية أو فاتورة', descriptionEn: 'Operating cost or bill', icon: BanknoteArrowUp, id: 'expense', labelAr: 'مصروف', labelEn: 'Expense' },
  { descriptionAr: 'دخل غير مرتبط ببيع', descriptionEn: 'Income not tied to a sale', icon: BanknoteArrowDown, id: 'income', labelAr: 'إيراد', labelEn: 'Income' },
  { descriptionAr: 'نقل قيمة بين حسابين', descriptionEn: 'Move value between two accounts', icon: ArrowLeftRight, id: 'transfer', labelAr: 'تحويل بين الحسابات', labelEn: 'Account transfer' },
  { descriptionAr: 'تسوية مدققة لرصيد حساب', descriptionEn: 'Audited account balance correction', icon: Calculator, id: 'adjustment', labelAr: 'تسوية', labelEn: 'Adjustment' },
];

export function TransactionChooser({ locale, onChoose, onClose }: TransactionChooserProps) {
  return (
    <FocusedOverlay className="transaction-chooser" labelId="transaction-chooser-title" onClose={onClose}>
      <header className="transaction-chooser__header">
        <div className="transaction-chooser__mark" aria-hidden="true">
          <BadgeDollarSign size={23} />
        </div>
        <div>
          <p className="eyebrow">MAX · {locale === 'ar' ? 'معاملة جديدة' : 'NEW TRANSACTION'}</p>
          <h2 id="transaction-chooser-title">{locale === 'ar' ? 'ماذا تريد أن تسجل؟' : 'What do you want to record?'}</h2>
        </div>
        <button aria-label={locale === 'ar' ? 'إغلاق' : 'Close'} className="icon-button" onClick={onClose} type="button">
          <X aria-hidden="true" size={19} />
        </button>
      </header>

      <div className="transaction-chooser__grid">
        {choices.map((choice, index) => {
          const Icon = choice.icon;
          return (
            <button
              aria-label={locale === 'ar' ? choice.labelAr : choice.labelEn}
              key={choice.id}
              className="transaction-choice"
              data-autofocus={index === 0 ? 'true' : undefined}
              data-choice={choice.id}
              onClick={() => onChoose(choice.id)}
              type="button"
            >
              <span className="transaction-choice__icon" aria-hidden="true"><Icon size={20} /></span>
              <span>
                <strong>{locale === 'ar' ? choice.labelAr : choice.labelEn}</strong>
                <small>{locale === 'ar' ? choice.descriptionAr : choice.descriptionEn}</small>
              </span>
            </button>
          );
        })}
      </div>

      <p className="transaction-chooser__hint">
        {locale === 'ar' ? 'اختصار لوحة المفاتيح: Ctrl+S' : 'Keyboard shortcut: Ctrl+S'}
      </p>
    </FocusedOverlay>
  );
}
