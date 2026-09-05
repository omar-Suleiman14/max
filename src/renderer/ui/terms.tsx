import { terms, TERMS_VERSION } from '../../shared/terms';
import type { Locale } from '../app/i18n';

export function Terms({ locale }: { locale: Locale }) {
  return (
    <details className="terms-panel">
      <summary>
        {locale === 'ar' ? 'الشروط والأحكام' : 'Terms & Conditions'} · {TERMS_VERSION}
      </summary>
      <div className="terms-panel__content" tabIndex={0}>
        {terms[locale].map(([title, body]) => (
          <section key={title}>
            <h3>{title}</h3>
            <p>{body}</p>
          </section>
        ))}
      </div>
    </details>
  );
}
