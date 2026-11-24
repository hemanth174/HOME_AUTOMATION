'use client';

import { Children, isValidElement, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

const MENU_GAP = 6;

export default function AppSelect({ children, value, onChange, className = '', id, name, disabled = false, required = false, 'aria-label': ariaLabel }) {
  const generatedId = useId().replace(/:/g, '');
  const listId = `app-select-${generatedId}`;
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const typeaheadRef = useRef({ text: '', timer: null });
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [position, setPosition] = useState(null);
  const [mounted, setMounted] = useState(false);

  const options = useMemo(() => Children.toArray(children)
    .filter(isValidElement)
    .filter((child) => child.type === 'option')
    .map((child) => ({
      value: String(child.props.value ?? child.props.children ?? ''),
      label: child.props.children,
      searchText: String(child.props.children ?? '').toLowerCase(),
      disabled: Boolean(child.props.disabled),
    })), [children]);
  const selectedIndex = options.findIndex((option) => option.value === String(value ?? ''));
  const selected = options[selectedIndex];

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const availableBelow = window.innerHeight - rect.bottom - MENU_GAP - 12;
    const availableAbove = rect.top - MENU_GAP - 12;
    const desiredHeight = Math.min(300, options.length * 42 + 12);
    const above = availableBelow < Math.min(desiredHeight, 180) && availableAbove > availableBelow;
    const maxHeight = Math.max(96, Math.min(desiredHeight, above ? availableAbove : availableBelow));
    const width = Math.min(Math.max(rect.width, 180), window.innerWidth - 24);
    setPosition({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      top: above ? rect.top - MENU_GAP - maxHeight : rect.bottom + MENU_GAP,
      width,
      maxHeight,
    });
  }, [options.length]);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!open) return;
    updatePosition();
    const closeOutside = (event) => {
      if (!triggerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnScroll = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener('pointerdown', closeOutside);
    window.addEventListener('scroll', closeOnScroll, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('scroll', closeOnScroll, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const item = menuRef.current?.querySelector(`[data-option-index="${highlighted}"]`);
    const menu = menuRef.current;
    if (item && menu) {
      if (item.offsetTop < menu.scrollTop) menu.scrollTop = item.offsetTop;
      else if (item.offsetTop + item.offsetHeight > menu.scrollTop + menu.clientHeight) {
        menu.scrollTop = item.offsetTop + item.offsetHeight - menu.clientHeight;
      }
    }
  }, [open, highlighted, position]);

  useEffect(() => () => window.clearTimeout(typeaheadRef.current.timer), []);

  const showMenu = () => {
    if (disabled || !options.length) return;
    setHighlighted(selectedIndex >= 0 ? selectedIndex : Math.max(0, options.findIndex((option) => !option.disabled)));
    updatePosition();
    setOpen(true);
  };

  const choose = (option) => {
    if (option.disabled) return;
    onChange?.({ target: { value: option.value, name } });
    setOpen(false);
    triggerRef.current?.focus();
  };

  const move = (direction) => {
    if (!options.length) return;
    let index = highlighted;
    for (let count = 0; count < options.length; count += 1) {
      index = (index + direction + options.length) % options.length;
      if (!options[index].disabled) { setHighlighted(index); return; }
    }
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') { if (open) { event.preventDefault(); setOpen(false); } return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) showMenu();
      else move(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      if (!open) return;
      event.preventDefault();
      const index = event.key === 'Home' ? options.findIndex((option) => !option.disabled) : options.findLastIndex((option) => !option.disabled);
      if (index >= 0) setHighlighted(index);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) showMenu();
      else if (options[highlighted]) choose(options[highlighted]);
      return;
    }
    if (event.key.length === 1 && /\S/.test(event.key)) {
      const next = (typeaheadRef.current.text + event.key).toLowerCase();
      typeaheadRef.current.text = next;
      window.clearTimeout(typeaheadRef.current.timer);
      typeaheadRef.current.timer = window.setTimeout(() => { typeaheadRef.current.text = ''; }, 700);
      const index = options.findIndex((option) => !option.disabled && option.searchText.startsWith(next));
      if (index >= 0) { if (!open) showMenu(); setHighlighted(index); }
    }
  };

  return <>
    <button
      ref={triggerRef}
      id={id}
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      aria-activedescendant={open ? `${listId}-${highlighted}` : undefined}
      aria-label={ariaLabel}
      aria-required={required || undefined}
      disabled={disabled}
      onClick={() => open ? setOpen(false) : showMenu()}
      onKeyDown={onKeyDown}
      className={`${className} inline-flex items-center justify-between gap-2 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span className="min-w-0 truncate">{selected?.label ?? 'Select…'}</span>
      <ChevronDown size={15} aria-hidden="true" className={`shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {mounted && open && position && createPortal(
      <div
        ref={menuRef}
        id={listId}
        role="listbox"
        aria-label={ariaLabel || selected?.label || 'Options'}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        className="overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-1.5 text-text shadow-[0_12px_32px_rgba(0,0,0,.22)]"
        style={{ position: 'fixed', zIndex: 10000, ...position }}
      >
        {options.map((option, index) => <div
          key={`${option.value}-${index}`}
          id={`${listId}-${index}`}
          data-option-index={index}
          role="option"
          aria-selected={index === selectedIndex}
          aria-disabled={option.disabled || undefined}
          onPointerMove={() => { if (!option.disabled) setHighlighted(index); }}
          onClick={() => choose(option)}
          className={`flex min-h-10 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${option.disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'} ${index === highlighted && !option.disabled ? 'bg-accent-bg text-text' : 'text-text'} ${index === selectedIndex ? 'font-black' : ''}`}
        >
          <span className="min-w-0 break-words">{option.label}</span>
          {index === selectedIndex && <Check size={15} aria-hidden="true" className="shrink-0 text-accent" />}
        </div>)}
      </div>, document.body,
    )}
  </>;
}
