"use client";
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastKind = 'success' | 'error' | 'info';

type ToastItem = {
  id: string;
  title?: string;
  message: string;
  kind: ToastKind;
  timeoutMs?: number;
};

type ToastContextValue = {
  toast: (msg: { message: string; title?: string; kind?: ToastKind; timeoutMs?: number }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }){
  const [items, setItems] = useState<ToastItem[]>([]);
  const remove = useCallback((id: string) => setItems(prev => prev.filter(t => t.id !== id)), []);
  const toast = useCallback((input: { message: string; title?: string; kind?: ToastKind; timeoutMs?: number }) => {
    const id = Math.random().toString(36).slice(2);
    const t: ToastItem = { id, message: input.message, title: input.title, kind: input.kind || 'info', timeoutMs: input.timeoutMs ?? 3500 };
    setItems(prev => [...prev, t]);
    if (t.timeoutMs && t.timeoutMs > 0) {
      window.setTimeout(() => remove(id), t.timeoutMs);
    }
  }, [remove]);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed z-[1000] bottom-4 right-4 flex flex-col gap-2">
        {items.map(item => (
          <div key={item.id} className={
            "min-w-[260px] max-w-[360px] shadow-lg rounded border p-3 text-sm bg-white " +
            (item.kind==='success' ? 'border-green-300' : item.kind==='error' ? 'border-red-300' : 'border-gray-300')
          }>
            <div className="flex items-start gap-2">
              <div className={
                "mt-0.5 text-lg " + (item.kind==='success' ? 'text-green-600' : item.kind==='error' ? 'text-red-600' : 'text-gray-600')
              }>
                {item.kind==='success' ? '✔' : item.kind==='error' ? '⚠' : 'ℹ'}
              </div>
              <div className="flex-1">
                {item.title && <div className="font-semibold mb-0.5">{item.title}</div>}
                <div className="text-gray-800">{item.message}</div>
              </div>
              <button onClick={()=>remove(item.id)} className="text-gray-500 hover:text-black">✕</button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
