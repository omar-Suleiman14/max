import { describe, expect, it } from 'vitest';

import { localeDirection, translate, translationKeys } from './i18n';

describe('Max locale contract', () => {
  it('keeps every English and Arabic shell message populated', () => {
    for (const key of translationKeys) {
      expect(translate('en', key).trim(), `English ${key}`).not.toBe('');
      expect(translate('ar', key).trim(), `Arabic ${key}`).not.toBe('');
    }
  });

  it('maps first-class locales to the correct writing direction', () => {
    expect(localeDirection('en')).toBe('ltr');
    expect(localeDirection('ar')).toBe('rtl');
  });
});
