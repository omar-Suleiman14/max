import { CornerDownLeft, Search } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent } from 'react';

import { type Locale, translate } from '../app/i18n';
import { FocusedOverlay } from './focused-overlay';

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
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const visibleCommands = useMemo(
    () =>
      normalizedQuery.length === 0
        ? commands
        : commands.filter((command) =>
            [command.label, ...command.keywords]
              .join(' ')
              .toLocaleLowerCase(locale)
              .includes(normalizedQuery),
          ),
    [commands, locale, normalizedQuery],
  );
  const safeActiveIndex = Math.min(activeIndex, Math.max(visibleCommands.length - 1, 0));

  function runCommand(index: number) {
    const command = visibleCommands[index];
    if (!command) return;
    onClose();
    command.run();
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((safeActiveIndex + 1) % Math.max(visibleCommands.length, 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((safeActiveIndex - 1 + Math.max(visibleCommands.length, 1)) % Math.max(visibleCommands.length, 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runCommand(safeActiveIndex);
    }
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
      <div className="command-menu__results" id="command-results" role="listbox">
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
