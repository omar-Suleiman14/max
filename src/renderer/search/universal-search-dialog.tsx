import {
  Bookmark,
  ChevronRight,
  FileText,
  Layout,
  Package,
  Receipt,
  Search,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import type { SearchResult, SearchResultKind } from '../../shared/views-search-contract';
import type { Locale } from '../app/i18n';
import { FocusedOverlay } from '../ui/focused-overlay';
import { searchCopy } from './search-i18n';

type UniversalSearchDialogProps = Readonly<{
  locale: Locale;
  onClose: () => void;
  onSelect: (result: UniversalSearchResult) => void;
}>;

export type UniversalSearchResult = SearchResult | Readonly<{
  databaseId?: string;
  id: string;
  kind: 'database' | 'record';
  matchScore: number;
  metadata?: string;
  subtitle?: string;
  title: string;
}>;

function resultIcon(kind: SearchResultKind | 'database' | 'record') {
  switch (kind) {
    case 'item':
      return <Package aria-hidden="true" size={16} />;
    case 'person':
      return <Users aria-hidden="true" size={16} />;
    case 'account':
      return <Wallet aria-hidden="true" size={16} />;
    case 'transaction':
      return <Receipt aria-hidden="true" size={16} />;
    case 'view':
      return <Bookmark aria-hidden="true" size={16} />;
    case 'database':
      return <Layout aria-hidden="true" size={16} />;
    case 'record':
      return <FileText aria-hidden="true" size={16} />;
    case 'page':
      return <Layout aria-hidden="true" size={16} />;
    default:
      return <FileText aria-hidden="true" size={16} />;
  }
}

export function UniversalSearchDialog({ locale, onClose, onSelect }: UniversalSearchDialogProps) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<readonly UniversalSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const trimmed = term.trim();
    if (!trimmed) {
      setResults([]);
      setSelectedIndex(0);
      return;
    }

    let active = true;
    setLoading(true);

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const [legacyResults, workspaceResults] = await Promise.all([
            window.maxApi.search.query(trimmed),
            window.maxApi.workspace.searchWorkspace(trimmed, 40),
          ]);
          if (active) {
            const genericResults: readonly UniversalSearchResult[] = workspaceResults.map((result) => ({
              databaseId: result.databaseId,
              id: result.entityId,
              kind: result.entityKind,
              matchScore: 1,
              metadata: result.displayMetadata,
              subtitle: result.displaySubtitle,
              title: result.displayTitle,
            }));
            const genericIds = new Set(genericResults.map((result) => result.id));
            setResults([...genericResults, ...legacyResults.filter((result) => !genericIds.has(result.id))]);
            setSelectedIndex(0);
          }
        } catch {
          if (active) setResults([]);
        } finally {
          if (active) setLoading(false);
        }
      })();
    }, 100);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [term]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((idx) => (results.length > 0 ? (idx + 1) % results.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((idx) => (results.length > 0 ? (idx - 1 + results.length) % results.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (results[selectedIndex]) {
        onSelect(results[selectedIndex]);
        onClose();
      }
    }
  }

  return (
    <FocusedOverlay className="search-dialog-overlay" labelId="search-dialog-title" onClose={onClose}>
      <div className="search-dialog">
        <div className="search-dialog__input-wrapper">
          <Search aria-hidden="true" className="search-dialog__search-icon" size={20} />
          <input
            ref={inputRef}
            aria-label={searchCopy(locale, 'search')}
            className="search-dialog__input"
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={searchCopy(locale, 'searchPlaceholder')}
            type="search"
            value={term}
          />
          <button aria-label="Close" className="icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        <div aria-busy={loading} className="search-dialog__results">
          {term.trim() && !loading && results.length === 0 && (
            <div className="search-dialog__empty">
              <p>
                {searchCopy(locale, 'noResults')} <strong>&quot;{term}&quot;</strong>
              </p>
            </div>
          )}

          {results.map((item, index) => {
            const isSelected = index === selectedIndex;
            return (
              <div
                key={`${item.kind}-${item.id}`}
                aria-selected={isSelected}
                className={`search-result-item ${isSelected ? 'search-result-item--active' : ''}`}
                onClick={() => {
                  onSelect(item);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                role="option"
              >
                <div className="search-result-item__icon">{resultIcon(item.kind)}</div>
                <div className="search-result-item__text">
                  <strong>{item.title}</strong>
                  {item.subtitle && <small>{item.subtitle}</small>}
                </div>
                {item.metadata && <span className="search-result-item__meta">{item.metadata}</span>}
                <ChevronRight aria-hidden="true" className="search-result-item__arrow" size={15} />
              </div>
            );
          })}
        </div>
      </div>
    </FocusedOverlay>
  );
}
