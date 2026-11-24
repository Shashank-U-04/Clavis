"use client";

/**
 * The MCP button and the dialog it opens (McpPanel). The dialog is drawn into the page's body,
 * so it looks the same from the app, Settings and the studio, whose own styles stay out of it.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { McpPanel } from "./McpPanel";

export function McpDialog({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", esc, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc, true);
      document.body.style.overflow = overflow;
      back?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-3 sm:p-8" role="dialog" aria-modal="true" aria-labelledby="mcp-title">
      <button type="button" className="fixed inset-0 bg-ink/40" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div ref={box} tabIndex={-1} className="relative w-full min-w-0 max-w-2xl border border-rule bg-paper font-sans text-ink shadow-2xl outline-none">
        <header className="flex items-center gap-3 border-b border-rule px-5 py-4 sm:px-7">
          <span className="label text-[0.62rem] text-ink-3">MCP</span>
          <h2 id="mcp-title" className="flex-1 text-lg font-semibold tracking-tight">
            Connect an AI agent
          </h2>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center border border-transparent hover:border-rule" aria-label="Close">
            <X size={18} strokeWidth={1.6} />
          </button>
        </header>
        <div className="px-5 py-6 sm:px-7">
          <McpPanel />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Anything that opens the MCP dialog: pass the look as `className` and the content as children. */
export function McpButton({ className, children, title = "Connect an AI agent (MCP)" }: { className: string; children: ReactNode; title?: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} title={title}>
        {children}
      </button>
      {open && <McpDialog onClose={close} />}
    </>
  );
}
