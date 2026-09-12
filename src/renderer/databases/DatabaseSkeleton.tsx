import type { Locale } from '../app/i18n';

/**
 * The shape of a database while its records are still being read.
 *
 * A database is a frame around rows. Replacing the whole thing with the word
 * "Loading" made opening the app look like the database itself had to be built
 * from scratch, so the frame is drawn straight away and only the rows are shown
 * as pending.
 */
export function DatabaseSkeleton({
  columns = 4,
  embedded = false,
  locale = 'en',
  rows = 5,
  withFrame = true,
}: Readonly<{
  columns?: number;
  embedded?: boolean;
  locale?: Locale;
  rows?: number;
  withFrame?: boolean;
}>) {
  const cells = Array.from({ length: columns }, (_, index) => index);
  return (
    <div
      aria-busy="true"
      aria-label={locale === 'ar' ? 'جارٍ تحميل السجلات' : 'Loading records'}
      className="database-skeleton"
      data-embedded={embedded || undefined}
      role="status"
    >
      {withFrame && (
        <>
          <div className="database-skeleton__heading" />
          <div className="database-skeleton__toolbar">
            <span /><span /><span />
          </div>
        </>
      )}
      <div className="database-skeleton__grid">
        <div className="database-skeleton__row database-skeleton__row--head">
          {cells.map((cell) => <span key={cell} />)}
        </div>
        {Array.from({ length: rows }, (_, row) => (
          <div className="database-skeleton__row" key={row}>
            {cells.map((cell) => <span key={cell} />)}
          </div>
        ))}
      </div>
    </div>
  );
}
