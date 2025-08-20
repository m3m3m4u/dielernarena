"use client";
import { useState, useEffect, ComponentType } from 'react';

export default function MarkdownPreview({ markdown }: { markdown: string }) {
  const [MD, setMD] = useState<ComponentType<{ children?: React.ReactNode; remarkPlugins?: unknown[] }> | null>(null);
  const [gfm, setGfm] = useState<unknown>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const m = await import('react-markdown');
      const g = await import('remark-gfm');
      if (mounted) {
        setMD(() => m.default as ComponentType<{ children?: React.ReactNode; remarkPlugins?: unknown[] }>);
        setGfm(() => (g as { default?: unknown }).default ?? g);
      }
    })();
    return () => { mounted = false; };
  }, []);
  if (!MD) return <div className="text-gray-400">Lade Vorschau…</div>;
  const Comp = MD; return <Comp remarkPlugins={gfm ? [gfm] as unknown[] : []}>{markdown}</Comp>;
}
