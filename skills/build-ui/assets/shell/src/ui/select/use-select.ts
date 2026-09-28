import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject, type ToggleEvent } from "react";
import { placePanel } from "./place-panel";
import { opensFromTrigger, readListKey } from "./select-keys";
import { edgeEnabledIndex, initialActiveIndex, stepEnabledIndex, type SelectOption } from "./select-options";

export interface SelectArguments {
  options: readonly SelectOption[];
  value: string;
  onChange: (value: string) => void;
}

interface SelectRefs {
  triggerRef: RefObject<HTMLButtonElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  listRef: RefObject<HTMLUListElement | null>;
}

export interface SelectControls extends SelectRefs {
  panelId: string;
  optionId: (index: number) => string;
  isOpen: boolean;
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  choose: (index: number) => void;
  onTriggerKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onListKeyDown: (event: KeyboardEvent<HTMLUListElement>) => void;
  onPanelToggle: (event: ToggleEvent<HTMLDivElement>) => void;
}

function useSelectRefs(): SelectRefs {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  return useMemo(() => ({ triggerRef, panelRef, listRef }), []);
}

function setPixels(element: HTMLElement, name: string, pixels: number) {
  element.style.setProperty(name, `${Math.round(pixels)}px`);
}

function placeByTrigger({ triggerRef, panelRef, listRef }: SelectRefs) {
  const [trigger, panel, list] = [triggerRef.current, panelRef.current, listRef.current];
  if (!trigger || !panel || !list) return;
  const anchor = trigger.getBoundingClientRect();
  setPixels(panel, "--select-min-width", anchor.width);
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const placement = placePanel(anchor, { width: panel.offsetWidth, height: list.scrollHeight }, viewport);
  setPixels(panel, "--select-top", placement.top);
  setPixels(panel, "--select-left", placement.left);
  setPixels(panel, "--select-max-height", placement.maxHeight);
  panel.dataset.placed = "";
}

function hidePanel({ panelRef, triggerRef }: SelectRefs) {
  const panel = panelRef.current;
  if (panel?.matches(":popover-open")) panel.hidePopover();
  triggerRef.current?.focus();
}

function useFollowTrigger(refs: SelectRefs, isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return;
    const follow = () => placeByTrigger(refs);
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, true);
    return () => {
      window.removeEventListener("resize", follow);
      window.removeEventListener("scroll", follow, true);
    };
  }, [isOpen, refs]);
}

function useActiveOptionInView(optionId: (index: number) => string, activeIndex: number, isOpen: boolean) {
  useEffect(() => {
    if (isOpen && activeIndex >= 0) document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isOpen, optionId]);
}

interface ListKeyArguments {
  refs: SelectRefs;
  options: readonly SelectOption[];
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  choose: (index: number) => void;
}

function useListKeys({ refs, options, activeIndex, setActiveIndex, choose }: ListKeyArguments) {
  return useCallback((event: KeyboardEvent<HTMLUListElement>) => {
    const action = readListKey(event.key);
    if (!action) return;
    if (action.kind !== "leave") event.preventDefault();
    if (action.kind === "move") return setActiveIndex(stepEnabledIndex(options, activeIndex, action.step));
    if (action.kind === "edge") return setActiveIndex(edgeEnabledIndex(options, action.edge));
    if (action.kind === "choose") return choose(activeIndex);
    hidePanel(refs);
  }, [activeIndex, choose, options, refs, setActiveIndex]);
}

function usePanelToggle(refs: SelectRefs, openAt: () => number, setOpen: (isOpen: boolean) => void, setActiveIndex: (index: number) => void) {
  return useCallback((event: ToggleEvent<HTMLDivElement>) => {
    const isNowOpen = event.newState === "open";
    setOpen(isNowOpen);
    if (!isNowOpen) {
      delete event.currentTarget.dataset.placed;
      return;
    }
    setActiveIndex(openAt());
    placeByTrigger(refs);
    refs.listRef.current?.focus();
  }, [openAt, refs, setActiveIndex, setOpen]);
}

export function useSelect({ options, value, onChange }: SelectArguments): SelectControls {
  const refs = useSelectRefs();
  const panelId = useId();
  const optionId = useCallback((index: number) => `${panelId}-option-${index}`, [panelId]);
  const [isOpen, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  useFollowTrigger(refs, isOpen);
  useActiveOptionInView(optionId, activeIndex, isOpen);

  const choose = useCallback((index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    hidePanel(refs);
  }, [onChange, options, refs]);
  const openAt = useCallback(() => initialActiveIndex(options, value), [options, value]);
  const onPanelToggle = usePanelToggle(refs, openAt, setOpen, setActiveIndex);
  const onListKeyDown = useListKeys({ refs, options, activeIndex, setActiveIndex, choose });
  const onTriggerKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
    if (!opensFromTrigger(event.key)) return;
    event.preventDefault();
    refs.panelRef.current?.showPopover();
  }, [refs]);

  return { ...refs, panelId, optionId, isOpen, activeIndex, setActiveIndex, choose, onTriggerKeyDown, onListKeyDown, onPanelToggle };
}
