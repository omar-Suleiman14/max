import { createPortal } from 'react-dom';
import { Children, isValidElement, useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode, type SelectHTMLAttributes } from 'react';
import { ChevronDown, Check } from 'lucide-react';

function textContent(node: ReactNode): string { return Children.toArray(node).map((child): string => typeof child === 'string' || typeof child === 'number' ? String(child) : isValidElement<{ children?: ReactNode }>(child) ? textContent(child.props.children) : '').join(''); }

type Option = { disabled: boolean; label: ReactNode; value: string };
function optionsFrom(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode; disabled?: boolean; value?: string | number }>(child)) return [];
    if (child.type !== 'option') return optionsFrom(child.props.children);
    return [{ disabled: Boolean(child.props.disabled), label: child.props.children, value: String(child.props.value ?? textContent(child.props.children)) }];
  });
}

/** App-rendered popup; focus stays on the trigger for overlays and inline editors. */
export function Select({ children, value, defaultValue, onChange, onBlur, onKeyDown, className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [localValue, setLocalValue] = useState(String(defaultValue ?? ''));
  const [active, setActive] = useState(0);
  const [label, setLabel] = useState<string>();
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 280 });
  const options = optionsFrom(children);
  const selected = options.find((option) => option.value === String(value ?? localValue)) ?? options[0];
  const typeahead = useRef({ text: '', at: 0 });

  useEffect(() => {
    const parent = trigger.current?.closest('label');
    setLabel(parent?.querySelector('span')?.textContent ?? undefined);
  }, [children]);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !popup.current?.contains(event.target)) setOpen(false);
    };
    const closeOnMove = () => setOpen(false);
    const closeOnScroll = (event: Event) => {
      if (event.target instanceof Node && popup.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    window.addEventListener('resize', closeOnMove);
    document.addEventListener('scroll', closeOnScroll, true);
    return () => { document.removeEventListener('pointerdown', close); window.removeEventListener('resize', closeOnMove); document.removeEventListener('scroll', closeOnScroll, true); };
  }, [open]);

  useEffect(() => { if (open) popup.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' }); }, [active, open]);

  function show() {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect || props.disabled) return;
    const below = window.innerHeight - rect.bottom - 12;
    const height = Math.min(280, Math.max(below, rect.top - 12));
    const width = Math.min(Math.max(rect.width, 160), window.innerWidth - 16);
    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top: below >= Math.min(280, options.length * 36 + 12) ? rect.bottom + 4 : Math.max(8, rect.top - Math.min(height, options.length * 36 + 12) - 4), width, maxHeight: height });
    setActive(Math.max(0, options.findIndex((option) => option === selected)));
    setOpen(true);
  }
  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    setLocalValue(option.value);
    const target = { value: option.value, name: props.name ?? '' } as HTMLSelectElement;
    onChange?.({ target, currentTarget: target } as ChangeEvent<HTMLSelectElement>);
    setOpen(false);
  }
  return <>
    <button {...props as SelectHTMLAttributes<HTMLSelectElement> as React.ButtonHTMLAttributes<HTMLButtonElement>}
      aria-activedescendant={open ? `${id}-${active}` : undefined} aria-controls={open ? id : undefined}
      aria-expanded={open} aria-haspopup="listbox" aria-label={props['aria-label'] ?? label} aria-required={props.required}
      className={`max-select ${className}`} onBlur={(event) => { setOpen(false); onBlur?.(event as unknown as React.FocusEvent<HTMLSelectElement>); }}
      onClick={() => open ? setOpen(false) : show()} onKeyDown={(event) => {
        if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); event.stopPropagation();
          if (!open) { show(); return; }
          const enabled = options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0);
          const current = enabled.indexOf(active);
          setActive(event.key === 'Home' ? enabled[0] ?? 0 : event.key === 'End' ? enabled.at(-1) ?? 0 : enabled[(current + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length] ?? 0);
          return;
        }
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); if (open) choose(active); else show(); return; }
        if (event.key === 'Tab') setOpen(false);
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
          const now = Date.now();
          typeahead.current = { text: (now - typeahead.current.at < 700 ? typeahead.current.text : '') + event.key.toLocaleLowerCase(), at: now };
          const index = options.findIndex((option) => !option.disabled && textContent(option.label).toLocaleLowerCase().startsWith(typeahead.current.text));
          if (index >= 0) { if (!open) show(); setActive(index); }
        }
        onKeyDown?.(event as unknown as React.KeyboardEvent<HTMLSelectElement>);
      }} ref={trigger} role="combobox" type="button">
      <span>{selected?.label ?? '—'}</span><ChevronDown aria-hidden="true" size={14} />
    </button>
    {props.name && <input name={props.name} type="hidden" value={selected?.value ?? ''} />}
    {open && createPortal(<div aria-label={props['aria-label'] ?? label} className="max-select-popup" dir={trigger.current ? getComputedStyle(trigger.current).direction : undefined} id={id} onMouseDown={(event) => event.preventDefault()} ref={popup} role="listbox" style={position}>
      {options.map((option, index) => <div aria-disabled={option.disabled || undefined} aria-selected={option.value === selected?.value} className="max-select-option" data-active={index === active} id={`${id}-${index}`} key={`${option.value}-${index}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); choose(index); }} onMouseMove={() => { if (!option.disabled) setActive(index); }} role="option">
        <span>{option.label}</span>{option.value === selected?.value && <Check aria-hidden="true" size={14} />}
      </div>)}
    </div>, document.body)}
  </>;
}
