import { useEffect, useRef, useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

/**
 * 应用内自绘下拉，替代原生 <select>：
 * - 弹层用 fixed 定位（不受滚动容器 overflow 裁剪），空间不足自动向上展开；
 * - 展开带动画；支持 Esc 关闭、方向键选择、点击外部关闭；
 * - 选中项高亮并带对勾。
 */
export function Select({ value, options, onChange, className = "", placeholder = "请选择" }: SelectProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const selected = options.find((o) => o.value === value);

  // 调试/截图用：URL 带 select-open=1 时挂载后自动展开一次
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("select-open")) openPopup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPopup = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const estH = Math.min(options.length * 34 + 8, 240);
    const openUp = r.bottom + estH > window.innerHeight - 8 && r.top - estH > 8;
    setRect({ left: r.left, top: openUp ? r.top - estH - 4 : r.bottom + 4, width: r.width });
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, options.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === "Enter") {
        const o = options[active];
        if (o) choose(o.value);
      }
    };
    const onScrollOrResize = (e: Event) => {
      if (popRef.current && popRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active, options]);

  useEffect(() => {
    if (!open) return;
    popRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    btnRef.current?.focus();
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPopup())}
        className={`flex items-center justify-between gap-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 transition-colors hover:border-blue-400 focus:border-blue-500 focus:outline-none ${className}`}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <svg
          className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && rect && (
        <div
          ref={popRef}
          role="listbox"
          className="wl-pop fixed z-[70] max-h-60 overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-xl"
          style={{ left: rect.left, top: rect.top, width: Math.max(rect.width, 140) }}
        >
          {options.map((o, i) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              data-active={i === active}
              className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                o.value === value ? "bg-blue-50 font-medium text-blue-700" : "text-gray-700 hover:bg-blue-50/70"
              } ${i === active && o.value !== value ? "bg-gray-50" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                choose(o.value);
              }}
            >
              <span className="truncate">{o.label}</span>
              {o.value === value && <span className="text-xs text-blue-600">✓</span>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
