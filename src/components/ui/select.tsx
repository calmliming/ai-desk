"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IconCheck, IconChevronDown } from "../icons";

/**
 * 统一的下拉选择组件（全站共用）。
 * 与原生 <select> 不同，选项面板自定义渲染、固定出现在触发器正下方，
 * 样式与琥珀主题一致；用法与 <select> 相同（children 传 <option>）。
 */

export const selectBaseCls =
  "flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-left text-sm text-zinc-800 shadow-sm outline-none transition-colors hover:border-amber-500/60 hover:bg-amber-500/10 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-400/20 dark:bg-amber-400/5 dark:text-zinc-200 dark:hover:border-amber-400/40 dark:hover:bg-amber-400/10";

export interface SelectProps {
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  title?: string;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
  /** 当 value 找不到对应选项时显示的占位文本 */
  placeholder?: string;
}

interface OptionItem {
  value: string;
  label: string;
  disabled?: boolean;
}

function nodeText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement(node)) {
    const { children } = node.props as { children?: ReactNode };
    return nodeText(children);
  }
  return "";
}

function collectOptions(children: ReactNode): OptionItem[] {
  const out: OptionItem[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as { value?: unknown; children?: ReactNode; disabled?: boolean };
    if (typeof props.value !== "string") return;
    out.push({
      value: props.value,
      label: nodeText(props.children),
      disabled: props.disabled,
    });
  });
  return out;
}

export default function Select({
  value,
  onChange,
  title,
  disabled,
  className = "",
  children,
  placeholder,
}: SelectProps) {
  const options = collectOptions(children);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const listId = useId();

  // 点击外部或触摸外部时关闭
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  const current = options.find((o) => o.value === value);
  const label = current?.label ?? placeholder ?? value ?? "";

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) setActive(-1);
      return next;
    });
  };

  const pick = (option: OptionItem) => {
    if (option.disabled) return;
    onChange?.({ target: { value: option.value } });
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setActive(0);
        } else {
          setActive((i) => (i + 1) % options.length);
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setActive(Math.max(options.length - 1, 0));
        } else {
          setActive((i) => (i - 1 + options.length) % options.length);
        }
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (open && active >= 0 && options[active]) {
          pick(options[active]);
        } else {
          toggle();
        }
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  return (
    <span ref={rootRef} className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={handleKeyDown}
        className={selectBaseCls}
        title={title}
      >
        <span className="truncate">{label}</span>
        <IconChevronDown
          width={14}
          height={14}
          className={`shrink-0 text-amber-500 transition-transform dark:text-amber-400 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && !disabled && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1.5 max-h-64 w-max min-w-full max-w-[85vw] overflow-y-auto rounded-xl border border-zinc-200 bg-white py-1 shadow-xl shadow-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-black/40"
        >
          {options.map((option, i) => {
            const selected = option.value === value;
            const highlighted = i === active && !selected;
            return (
              <button
                key={`${option.value}-${i}`}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={option.disabled}
                onClick={() => pick(option)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  selected
                    ? "bg-amber-500/10 font-medium text-orange-700 dark:bg-amber-400/10 dark:text-amber-300"
                    : highlighted
                      ? "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                      : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                <span className="truncate">{option.label}</span>
                {selected && (
                  <IconCheck
                    width={13}
                    height={13}
                    strokeWidth={2.6}
                    className="shrink-0 text-orange-600 dark:text-amber-400"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}
