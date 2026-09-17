import type { ReactNode } from 'react';

import type { Locale } from '../app/i18n';
import { propertyReadOnlyReason } from './property-editing-copy';

export function ReadOnlyPropertyValue({ children, className, locale }: { children: ReactNode; className?: string; locale: Locale }) {
  const reason = propertyReadOnlyReason(locale);
  return <span className={className} title={reason}>{children}<span className="sr-only"> — {reason}</span></span>;
}
