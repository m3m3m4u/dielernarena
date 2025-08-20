"use client";
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useToast } from '@/components/shared/ToastProvider';

export type MediaItem = { name: string; url: string; size: number; key?: string; mtime?: number };

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (item: MediaItem) => void;
}

export default function MediaPicker({ open, onClose, onSelect }: Props){
  const { data: session } = useSession();
  const role = session?.user?.role as string | undefined;
  const canUpload = role === 'author' || role === 'admin';
  const { toast } = useToast();

  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [uploading, setUploading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  const load = useCallback(async () => {
    setLoading(true);
    try{
      const res = await fetch('/api/media');
      const d = await res.json().catch(()=>({}));
      if(res.ok && d?.success){ setItems(d.items || []); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if(open) void load(); }, [open, load]);

  const filtered = useMemo(() => {
    if(!q) return items;
    const qq = q.toLowerCase();
    return items.filter(it => it.name.toLowerCase().includes(qq));
  }, [items, q]);
  useEffect(()=>{ setPage(1); }, [q]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);

  const doUploadFiles = async (files: FileList | File[]) => {
    if(!canUpload) return;
    const arr = Array.from(files);
    if(arr.length===0) return;
    setUploading(true);
    try{
      for(const file of arr){
        const fd = new FormData();
        fd.append('file', file);
        fd.append('filename', file.name);
        const res = await fetch('/api/media', { method:'POST', body: fd });
        const d = await res.json().catch(()=>({}));
        if(res.ok && d?.success){
          toast({ title:'Upload erfolgreich', message: d.name, kind:'success' });
        } else {
          toast({ title:'Upload fehlgeschlagen', message: `${file.name}: ${d?.error || res.statusText}`, kind:'error' });
        }
      }
      void load();
    } catch {
      toast({ title:'Netzwerkfehler', message:'Upload nicht möglich', kind:'error' });
    } finally {
      setUploading(false);
    }
  };

  if(!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-4xl rounded shadow-lg" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Medien auswählen</h3>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-900">✖</button>
        </div>
        <div className="p-4 flex items-center justify-between gap-3">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Suche…" className="border rounded px-2 py-1 text-sm flex-1" />
          <select value={pageSize} onChange={e=>{ setPageSize(Number(e.target.value)||12); setPage(1); }} className="border rounded px-2 py-1 text-sm">
            <option value={12}>12 / Seite</option>
            <option value={24}>24 / Seite</option>
            <option value={48}>48 / Seite</option>
          </select>
          {canUpload && (
            <label className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 cursor-pointer">
              ⬆️ Dateien auswählen
              <input type="file" multiple className="hidden" onChange={(e)=>{ if(e.target.files) void doUploadFiles(e.target.files); e.target.value=''; }} />
            </label>
          )}
        </div>
        {loading ? (
          <div className="p-6 text-gray-500">Lade Medien…</div>
        ) : (
          <div className="p-4 grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
            {visible.map(it => {
              const isImage = /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(it.name);
              return (
                <button key={it.name} onClick={()=> onSelect(it)} className="border rounded p-3 text-left bg-white hover:bg-blue-50 focus:bg-blue-50">
                  <div className="w-full h-28 flex items-center justify-center bg-gray-50 border rounded overflow-hidden mb-2">
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.url} alt={it.name} className="object-cover w-full h-full" />
                    ) : (
                      <div className="text-3xl">🗂️</div>
                    )}
                  </div>
                  <div className="font-mono text-xs truncate" title={it.name}>{it.name}</div>
                  <div className="text-[11px] text-gray-500 flex gap-2 flex-wrap">
                    <span>📦 {(it.size/1024).toFixed(1)} KB</span>
                    {typeof it.mtime === 'number' && <span>📅 {new Date(it.mtime).toLocaleString('de-DE')}</span>}
                  </div>
                </button>
              );
            })}
            {filtered.length===0 && (
              <div className="text-gray-500 text-sm">Keine Medien gefunden.</div>
            )}
          </div>
        )}
        <div className="p-3 border-t flex items-center justify-between text-sm">
          <div className="text-gray-600 pl-1">{filtered.length} Datei(en) • Seite {safePage} / {pageCount}</div>
          <div className="flex items-center gap-2">
            <button onClick={()=> setPage(p=> Math.max(1, p-1))} disabled={safePage<=1} className="px-2 py-1 rounded border bg-white disabled:opacity-50">← Zurück</button>
            <button onClick={()=> setPage(p=> Math.min(pageCount, p+1))} disabled={safePage>=pageCount} className="px-2 py-1 rounded border bg-white disabled:opacity-50">Weiter →</button>
            <button onClick={onClose} className="ml-2 px-3 py-1.5 rounded border text-sm bg-white hover:bg-gray-50">Schließen</button>
          </div>
          {uploading && <span className="ml-3 text-xs text-gray-500">Lade hoch…</span>}
        </div>
      </div>
    </div>
  );
}
