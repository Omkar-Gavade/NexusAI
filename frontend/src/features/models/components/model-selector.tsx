import { useEffect, useId, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Check, ChevronDown } from 'lucide-react';
import { isRoutable, type ChatSelection, type Model, type RoutingMode } from '@nexusai/contracts';
import { Skeleton } from '@/components/ui/skeleton';
import { contextWindow } from '@/lib/format';
import { useModels } from '../use-models';

/*
 * The note says what the mode does, not how it feels. "fastest / balanced /
 * thorough" ranked the modes without ever explaining that two of them run
 * several models and reconcile them and one does not — which is the single
 * thing a reader needs in order to choose.
 */
const ROUTING: ReadonlyArray<{ mode: RoutingMode; label: string; note: string }> = [
  { mode: 'single', label: 'Single model', note: 'one model · fastest' },
  { mode: 'balanced', label: 'Synthesis · 3 models', note: 'three models · reconciled' },
  { mode: 'thorough', label: 'Synthesis · 5 models', note: 'five models · reconciled' },
];

type Option =
  | { kind: 'routing'; id: string; mode: RoutingMode; label: string; note: string }
  | { kind: 'model'; id: string; model: Model; disabled: boolean };

/**
 * Contains no model name, no provider name, and no ordering — the catalog comes
 * from the backend. Unavailable models are listed, disabled, and annotated with
 * their reason: hiding them makes the product feel smaller and leaves the user
 * unable to discover why a model is missing.
 */
export function ModelSelector({
  selection,
  onChange,
}: {
  selection: ChatSelection;
  onChange: (selection: ChatSelection) => void;
}) {
  const { data, isPending, isError } = useModels();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const options = useMemo<Option[]>(() => {
    const routing: Option[] = ROUTING.map((r) => ({
      kind: 'routing',
      id: `routing:${r.mode}`,
      mode: r.mode,
      label: r.label,
      note: r.note,
    }));
    const models: Option[] = (data?.models ?? []).map((model) => ({
      kind: 'model',
      id: `model:${model.id}`,
      model,
      disabled: !isRoutable(model.availability),
    }));
    return [...routing, ...models];
  }, [data]);

  const selectableIndexes = useMemo(
    () => options.flatMap((o, i) => (o.kind === 'routing' || !o.disabled ? [i] : [])),
    [options],
  );

  const currentId =
    selection.mode === 'auto' ? `routing:${selection.routing}` : `model:${selection.modelId}`;

  useEffect(() => {
    if (!open) return;
    const found = options.findIndex((o) => o.id === currentId);
    setActiveIndex(found >= 0 ? found : (selectableIndexes[0] ?? 0));
  }, [open, options, currentId, selectableIndexes]);

  const label =
    selection.mode === 'manual'
      ? (data?.models.find((m) => m.id === selection.modelId)?.displayName ?? selection.modelId)
      : (ROUTING.find((r) => r.mode === selection.routing)?.label ?? 'Auto');

  const commit = (option: Option) => {
    if (option.kind === 'routing') onChange({ mode: 'auto', routing: option.mode });
    else if (!option.disabled) onChange({ mode: 'manual', modelId: option.model.id });
    setOpen(false);
    triggerRef.current?.focus();
  };

  const move = (direction: 1 | -1) => {
    const position = selectableIndexes.indexOf(activeIndex);
    const next =
      position === -1
        ? (selectableIndexes[0] ?? 0)
        : (selectableIndexes[
            Math.min(Math.max(position + direction, 0), selectableIndexes.length - 1)
          ] ?? activeIndex);
    setActiveIndex(next);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (open) move(1);
        else setOpen(true);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (open) move(-1);
        break;
      case 'Home':
        if (open) {
          event.preventDefault();
          setActiveIndex(selectableIndexes[0] ?? 0);
        }
        break;
      case 'End':
        if (open) {
          event.preventDefault();
          setActiveIndex(selectableIndexes.at(-1) ?? 0);
        }
        break;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        // Stops the keystroke reaching the composer's submit handler.
        event.stopPropagation();
        if (!open) setOpen(true);
        else {
          const option = options[activeIndex];
          if (option) commit(option);
        }
        break;
      }
      case 'Escape':
        if (open) {
          event.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
        }
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        !listRef.current?.contains(event.target as Node) &&
        !triggerRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        // A combobox does not take its accessible name from its contents, so
        // the visible label is not enough — without this it announces as an
        // unlabelled combobox.
        aria-label="Routing and model"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={clsx(
          'inline-flex h-(--control-sm) items-center gap-1 rounded-control px-2 text-ui text-ink-2',
          'transition-colors duration-(--duration-instant) hover:bg-hover hover:text-ink',
        )}
      >
        <span className="max-w-[180px] truncate">{label}</span>
        <ChevronDown size={13} aria-hidden="true" className="shrink-0 text-ink-3" />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Routing and models"
          tabIndex={-1}
          className={clsx(
            'absolute bottom-full left-0 z-(--z-dropdown) mb-1.5 max-h-[min(400px,60dvh)] w-[280px]',
            'overflow-y-auto rounded-overlay border border-line bg-floating p-1 shadow-float',
            'motion-safe:animate-[dropdown-in_140ms_var(--ease-out)]',
            // Full-width bottom sheet on touch-sized viewports.
            'max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:mb-0 max-md:w-auto',
            'max-md:rounded-b-none max-md:border-x-0 max-md:border-b-0',
          )}
        >
          <Group label="RESPONSE MODE" />
          {options.map((option, index) =>
            option.kind === 'routing' ? (
              <Row
                key={option.id}
                id={`${listId}-${index}`}
                active={index === activeIndex}
                selected={option.id === currentId}
                onSelect={() => commit(option)}
                title={option.label}
                subtitle={option.note}
              />
            ) : null,
          )}

          {isPending && (
            <div className="flex flex-col gap-1 p-2">
              <Skeleton height={28} />
              <Skeleton height={28} />
              <Skeleton height={28} />
            </div>
          )}

          {isError && <p className="p-3 text-micro text-ink-3">Couldn&apos;t load models.</p>}

          {data && data.models.length === 0 && (
            <p className="p-3 text-micro text-ink-3">No real models are currently available.</p>
          )}

          {data && data.models.length > 0 && (
            <>
              <Group
                label="ANSWER WITH ONE MODEL"
                hint="Answered by that model alone — no synthesis pass."
              />
              {options.map((option, index) =>
                option.kind === 'model' ? (
                  <Row
                    key={option.id}
                    id={`${listId}-${index}`}
                    active={index === activeIndex}
                    selected={option.id === currentId}
                    disabled={option.disabled}
                    onSelect={() => commit(option)}
                    title={option.model.displayName}
                    subtitle={`${option.model.provider.id} · ${
                      option.disabled
                        ? (option.model.availabilityReason ?? 'unavailable')
                        : contextWindow(option.model.contextWindow)
                    }`}
                  />
                ) : null,
              )}
            </>
          )}
        </ul>
      )}
    </div>
  );
}

function Group({ label, hint }: { label: string; hint?: string }) {
  return (
    <li role="presentation" className="px-2 pb-1 pt-2">
      <span data-register="machine" className="text-note uppercase text-ink-3">
        {label}
      </span>
      {hint && <span className="mt-0.5 block text-meta text-ink-3">{hint}</span>}
    </li>
  );
}

function Row({
  id,
  title,
  subtitle,
  active,
  selected,
  disabled = false,
  onSelect,
}: {
  id: string;
  title: string;
  subtitle: string;
  active: boolean;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    // role="presentation" on the li so the button is the listbox's own child.
    // A real button keeps native activation semantics; focus stays on the
    // combobox and aria-activedescendant tracks which option is current.
    <li role="presentation">
      <button
        type="button"
        id={id}
        role="option"
        tabIndex={-1}
        aria-selected={selected}
        aria-disabled={disabled || undefined}
        onClick={disabled ? undefined : onSelect}
        className={clsx(
          'flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left',
          'max-md:min-h-12',
          active && !disabled && 'bg-hover',
          selected && 'bg-selected',
          disabled && 'cursor-not-allowed opacity-55',
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-ui text-ink">{title}</span>
          <span data-register="machine" className="block truncate text-meta text-ink-3">
            {subtitle}
          </span>
        </span>
        {selected && <Check size={13} aria-hidden="true" className="shrink-0 text-accent" />}
      </button>
    </li>
  );
}
