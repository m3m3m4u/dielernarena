"use client";
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/shared/ToastProvider';

export type MediaItem = { name: string; url: string; size: number; key?: string; mtime?: number };

export default function MediaLibrary({ canUpload }: { canUpload: boolean }){
  const { toast } = useToast();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [q, setQ] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/media');
      const d = await res.json().catch(()=>({}));
      if(res.ok && d?.success){ setItems(d.items || []); }
    } finally { setLoading(false); }
  }, []);
  useEffect(()=>{ void load(); }, [load]);
  useEffect(()=>{ setPage(1); }, [q]);

  const filtered = useMemo(()=>{
    if(!q) return items;
    const qq = q.toLowerCase();
    return items.filter(it => it.name.toLowerCase().includes(qq));
  }, [items, q]);
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
        if(res.ok && d?.success){ toast({ title:'Upload erfolgreich', message: d.name, kind:'success' }); }
        else { toast({ title:'Upload fehlgeschlagen', message: `${file.name}: ${d?.error || res.statusText}`, kind:'error' }); }
      }
      void load();
    } catch {
      toast({ title:'Netzwerkfehler', message:'Upload nicht möglich', kind:'error' });
    } finally { setUploading(false); }
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if(e.target.files) await doUploadFiles(e.target.files);
    e.target.value = '';
  };
  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
    if(!canUpload) return;
    const files = e.dataTransfer.files; if(files?.length) await doUploadFiles(files);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Medienbibliothek</h2>
        <div className="flex items-center gap-2">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Suche…" className="border rounded px-2 py-1 text-sm" />
          <select value={pageSize} onChange={e=>{ setPageSize(Number(e.target.value)||12); setPage(1); }} className="border rounded px-2 py-1 text-sm">
            <option value={12}>12 / Seite</option>
            <option value={24}>24 / Seite</option>
            <option value={48}>48 / Seite</option>
          </select>
          {canUpload && (
            <label className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 cursor-pointer">
              ⬆️ Medien hochladen
              <input type="file" multiple className="hidden" onChange={onUpload} accept="image/*,audio/*,video/*,.pdf,.csv,.txt,.md" />
            </label>
          )}
        </div>
      </div>
      {loading ? (
        <div className="text-gray-500">Lade Medien…</div>
      ) : (
        <div onDragOver={(e)=>{ if(canUpload){ e.preventDefault(); setDragOver(true);} }} onDragLeave={()=> setDragOver(false)} onDrop={onDrop} className={`grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ${dragOver? 'outline outline-2 outline-blue-400 outline-offset-2':''}`}>
          {visible.map(it => {
            const isImage = /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(it.name);
            return (
              <div key={it.name} className="border rounded p-4 bg-white flex items-center gap-3">
                <div className="w-16 h-16 flex items-center justify-center bg-gray-50 border rounded overflow-hidden">
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.url} alt={it.name} className="object-cover w-full h-full" />
                  ) : (
                    <div className="text-3xl">🗂️</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm truncate" title={it.name}>{it.name}</div>
                  <div className="text-xs text-gray-500 flex gap-3 flex-wrap">
                    <span>📦 {(it.size/1024).toFixed(1)} KB</span>
                    {typeof it.mtime === 'number' && (
                      <span>📅 {new Date(it.mtime).toLocaleString('de-DE')}</span>
                    )}
                  </div>
                  <div className="flex gap-3 items-center mt-1">
                    <a href={it.url} target="_blank" className="text-blue-600 text-xs hover:underline">Öffnen</a>
                    <button onClick={async ()=>{ try{ await navigator.clipboard.writeText(it.url); toast({ title:'Kopiert', message:'URL in Zwischenablage', kind:'success' }); } catch{} }} className="text-xs text-gray-600 border rounded px-2 py-0.5 hover:bg-gray-50">URL kopieren</button>
                    {canUpload && (
                      <button onClick={async ()=>{ const nn = prompt('Neuer Dateiname (inkl. Endung):', it.name); if(!nn || nn===it.name) return; try{ const res = await fetch('/api/media', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: it.name, newName: nn }) }); const d = await res.json().catch(()=>({})); if(res.ok && d?.success){ setItems(prev=> prev.map(x=> x.name===it.name ? { ...x, name: nn, url: d.url, key: d.key } : x)); } else { alert(d?.error || res.statusText); } } catch{ alert('Umbenennen fehlgeschlagen'); } }} className="text-xs text-gray-600 border rounded px-2 py-0.5 hover:bg-gray-50">Umbenennen</button>
                    )}
                  </div>
                </div>
                {canUpload && (
                  <button
                    onClick={async ()=>{ if(!confirm('Datei wirklich löschen?')) return; try{ const qp = new URLSearchParams(); qp.set('name', it.name); if(it.key) qp.set('key', it.key); const res = await fetch(`/api/media?${qp.toString()}`, { method:'DELETE' }); const d = await res.json().catch(()=>({})); if(res.ok && d?.success){ setItems(prev=> prev.filter(x=>x.name!==it.name)); } else { alert(d?.error || res.statusText); } } catch{ alert('Löschen fehlgeschlagen'); } }}
                    className="text-red-600 text-xs border border-red-200 rounded px-2 py-1 hover:bg-red-50"
                  >Löschen</button>
                )}
              </div>
            );
          })}
          {filtered.length===0 && (
            <div className="text-gray-500">Keine Medien vorhanden.</div>
          )}
        </div>
      )}
      <div className="mt-4 flex items-center justify-between text-sm">
        <div className="text-gray-600">{filtered.length} Datei(en) • Seite {safePage} / {pageCount}</div>
        <div className="flex gap-2">
          <button className="px-3 py-1 border rounded disabled:opacity-50" onClick={()=> setPage(p=> Math.max(1, p-1))} disabled={safePage<=1}>← Zurück</button>
          <button className="px-3 py-1 border rounded disabled:opacity-50" onClick={()=> setPage(p=> Math.min(pageCount, p+1))} disabled={safePage>=pageCount}>Weiter →</button>
        </div>
      </div>
      {uploading && <div className="text-xs text-gray-500 mt-2">Lade hoch…</div>}
    </div>
  );
}
