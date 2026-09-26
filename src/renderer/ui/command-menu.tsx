import { CornerDownLeft, Search } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent } from 'react';

import { type Locale, translate } from '../app/i18n';
import { FocusedOverlay } from './focused-overlay';
import { normalizeSearchText } from '../../shared/search-text';
import { matchTier } from '../search/result-ranking';
import { handleListboxKey, resultCountMessage } from './listbox-keys';

export type Command = Readonly<{
  id: string;
  keywords: readonly string[];
  label: string;
  run: () => void;
}>;

type CommandMenuProps = Readonly<{
  commands: readonly Command[];
  locale: Locale;
  onClose: () => void;
}>;

export function CommandMenu({ commands, locale, onClose }: CommandMenuProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const normalizedQuery = normalizeSearchText(query);
  // The same rule as workspace search: exact label, label prefix, label
  // containing the query, then a keyword-only match. Ties keep the given order.
  const visibleCommands = useMemo(
    () =>
      normalizedQuery.length === 0
        ? commands
        : commands
          .filter((command) => normalizeSearchText([command.label, ...command.keywords].join(' ')).includes(normalizedQuery))
          .map((command, index) => ({ command, index, tier: matchTier(command.label, normalizedQuery) }))
          .sort((left, right) => left.tier - right.tier || left.index - right.index)
          .map(({ command }) => command),
    [commands, normalizedQuery],
  );
  const safeActiveIndex = Math.min(activeIndex, Math.max(visibleCommands.length - 1, 0));

  function runCommand(index: number) {
    const command = visibleCommands[index];
    if (!command) return;
    onClose();
    command.run();
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    handleListboxKey(event, { activeIndex: safeActiveIndex, count: visibleCommands.length, onActiveChange: setActiveIndex, onChoose: runCommand });
  }

  return (
    <FocusedOverlay className="command-menu" labelId="command-menu-title" onClose={onClose}>
      <h2 className="sr-only" id="command-menu-title">{translate(locale, 'commandLabel')}</h2>
      <div className="command-menu__search">
        <Search aria-hidden="true" size={20} />
        <input
          data-autofocus="true"
          aria-activedescendant={visibleCommands[safeActiveIndex] ? `command-${visibleCommands[safeActiveIndex].id}` : undefined}
          aria-controls="command-results"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-label={translate(locale, 'commandSearch')}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleInputKeyDown}
          placeholder={translate(locale, 'commandPlaceholder')}
          role="combobox"
          value={query}
        />
        <kbd>Esc</kbd>
      </div>
      <p className="command-menu__hint">{translate(locale, 'commandHint')}</p>
      <p aria-live="polite" className="sr-only" role="status">{normalizedQuery ? resultCountMessage(visibleCommands.length, locale) : ''}</p>
      <div aria-label={translate(locale, 'commandLabel')} className="command-menu__results" id="command-results" role="listbox">
        {visibleCommands.length === 0 && <p className="command-menu__empty">{translate(locale, 'commandNoResults')}</p>}
        {visibleCommands.map((command, index) => (
          <button
            key={command.id}
            aria-selected={index === safeActiveIndex}
            className="command-item"
            id={`command-${command.id}`}
            onClick={() => runCommand(index)}
            onMouseEnter={() => setActiveIndex(index)}
            role="option"
            tabIndex={-1}
            type="button"
          >
            <span>{command.label}</span>
            {index === safeActiveIndex && <CornerDownLeft aria-hidden="true" size={16} />}
          </button>
        ))}
      </div>
    </FocusedOverlay>
  );
}
