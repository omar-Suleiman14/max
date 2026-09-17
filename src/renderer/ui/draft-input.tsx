import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';

type DraftInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'defaultValue' | 'onBlur' | 'onChange' | 'onKeyDown' | 'value'> & Readonly<{
  normalize?: (value: string) => string;
  onCommit: (value: string) => void;
  onDraftChange?: (value: string) => void;
  value: string;
}>;

/** Shared single-line property editing behavior. */
export function DraftInput({ normalize, onCommit, onDraftChange, value, ...props }: DraftInputProps) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const committed = useRef(value);
  const skipBlur = useRef(false);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      committed.current = value;
      setDraft(value);
    }
  }, [value]);

  const updateDraft = (next: string) => {
    const normalized = normalize ? normalize(next) : next;
    setDraft(normalized);
    onDraftChange?.(normalized);
  };

  const commit = () => {
    if (draft === committed.current) return;
    committed.current = draft;
    onCommit(draft);
  };

  const cancel = () => {
    const previous = committed.current;
    setDraft(previous);
    onDraftChange?.(previous);
  };

  return (
    <input
      {...props}
      ref={inputRef}
      value={draft}
      onChange={(event) => updateDraft(event.target.value)}
      onBlur={() => {
        if (skipBlur.current) {
          skipBlur.current = false;
          return;
        }
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
          skipBlur.current = true;
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancel();
          skipBlur.current = true;
          event.currentTarget.blur();
        }
      }}
    />
  );
}
