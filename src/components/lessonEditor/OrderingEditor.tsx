"use client";
import BackLink from '@/components/shared/BackLink';
import TitleCategoryBar from '@/components/shared/TitleCategoryBar';
import { Lesson } from './types';

export interface OrderingEditorProps {
  lesson: Lesson;
  title: string; setTitle: (v: string)=>void;
  category: string; setCategory: (v: string)=>void;
  orderingRaw: string; setOrderingRaw: (v: string)=>void;
  orderingItems: string[];
  orderingPreview: string[];
  moveOrderingPreview: (idx: number, dir: -1|1)=>void;
  reshuffleOrderingPreview: ()=>void;
  handleSave: ()=>void; saving: boolean;
  returnToExercises: boolean;
}

export default function OrderingEditor({ lesson, title, setTitle, category, setCategory, orderingRaw, setOrderingRaw, orderingItems, orderingPreview, moveOrderingPreview, reshuffleOrderingPreview, handleSave, saving, returnToExercises }: OrderingEditorProps) {
  const updateRaw = (v: string) => {
    setOrderingRaw(v);
    // Items werden extern im Parent aktualisiert – hier keine extra Logik
  };
  const canSave = title.trim() && orderingItems.length >=2;
  return (
    <main className="max-w-6xl mx-auto mt-10 p-6">
      <BackLink lesson={lesson} returnToExercises={returnToExercises} />
      <h1 className="text-2xl font-bold mb-6">🔢 Reihenfolge-Lektion bearbeiten</h1>
      <TitleCategoryBar title={title} setTitle={setTitle} category={category} setCategory={setCategory} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border rounded p-6 space-y-4">
          <h3 className="font-semibold">🔢 Schritte (jede Zeile ein Schritt)</h3>
          <textarea value={orderingRaw} onChange={e=>updateRaw(e.target.value)} className="w-full h-72 p-3 border rounded font-mono text-sm" placeholder={'Schritt 1\nSchritt 2\nSchritt 3'} />
          <div className="text-xs text-gray-500 flex gap-4 flex-wrap">
            <span>Erkannt: {orderingItems.length}/10</span>
            {orderingItems.length < 2 && <span className="text-red-600">Mindestens 2</span>}
            {orderingItems.length >=2 && <span className="text-green-600">OK</span>}
          </div>
          <button onClick={handleSave} disabled={saving || !canSave} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400">{saving ? '💾 Speichert...' : '💾 Speichern'}</button>
          <div className="text-xs text-gray-500">Leere Zeilen werden ignoriert. Spieler sehen eine zufällige Startreihenfolge und sortieren mit Pfeilen.</div>
        </div>
        <div className="bg-white border rounded p-6 space-y-6">
          <div>
            <h3 className="font-semibold mb-2">👁️ Vorschau (korrekte Reihenfolge)</h3>
            {orderingItems.length < 2 ? <div className="text-gray-400 text-sm">Mindestens 2 Schritte erforderlich.</div> : (
              <ol className="list-decimal pl-5 space-y-1 text-sm">
                {orderingItems.map((it,idx)=><li key={idx}>{it || <span className="text-red-500">(leer)</span>}</li>)}
              </ol>
            )}
            <div className="mt-2 text-xs flex gap-4 text-gray-500">
              <span>Schritte: {orderingItems.length}/10</span>
              {!canSave && <span className="text-red-600">Alle Schritte ausfüllen</span>}
              {canSave && <span className="text-green-600">Format ok</span>}
            </div>
          </div>
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-sm">Spieler-Vorschau (mit Pfeilen)</h4>
              <button type="button" onClick={reshuffleOrderingPreview} disabled={orderingItems.length<2} className={`text-xs px-2 py-1 border rounded ${orderingItems.length<2? 'opacity-40 cursor-not-allowed':'hover:bg-gray-50'}`}>Neu mischen</button>
            </div>
            {orderingItems.length < 2 ? <div className="text-gray-400 text-sm">Mindestens 2 Schritte für Vorschau.</div> : (
              <ul className="space-y-2">
                {orderingPreview.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2 border rounded p-2 bg-gray-50 text-xs">
                    <div className="flex flex-col gap-1 pt-0.5">
                      <button type="button" onClick={()=>moveOrderingPreview(idx,-1)} disabled={idx===0} className={`w-6 h-6 border rounded ${idx===0? 'opacity-30 cursor-not-allowed':'hover:bg-white'}`}>↑</button>
                      <button type="button" onClick={()=>moveOrderingPreview(idx,1)} disabled={idx===orderingPreview.length-1} className={`w-6 h-6 border rounded ${idx===orderingPreview.length-1? 'opacity-30 cursor-not-allowed':'hover:bg-white'}`}>↓</button>
                    </div>
                    <div className="flex-1 whitespace-pre-wrap">{step}</div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[10px] text-gray-500">Diese Vorschau ändert nicht die gespeicherte Reihenfolge – sie simuliert nur die Spieler-Sicht.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
