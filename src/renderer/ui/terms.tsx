import { useEffect, useRef, type UIEvent } from 'react';
import { terms, TERMS_VERSION } from '../../shared/terms';
import type { Locale } from '../app/i18n';

export function Terms({ locale, onScrollToBottom }: { locale: Locale; onScrollToBottom?: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const { scrollHeight, clientHeight } = scrollRef.current;
      if (scrollHeight <= clientHeight + 10) {
        onScrollToBottom?.();
      }
    }
  }, [locale, onScrollToBottom]);

  function handleScroll(e: UIEvent<HTMLDivElement>) {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 20) {
      onScrollToBottom?.();
    }
  }

  return (
    <div className="terms-panel">
      <div className="terms-panel__header">
        {locale === 'ar' ? 'الشروط والأحكام' : 'Terms & Conditions'} · {TERMS_VERSION}
      </div>
      <div className="terms-panel__content" tabIndex={0} onScroll={handleScroll} ref={scrollRef}>
        {terms[locale].map(([title, body]) => (
          <section key={title}>
            <h3>{title}</h3>
            <p>{body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
