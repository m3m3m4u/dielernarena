"use client";
import BackLink from '@/components/shared/BackLink';
import TitleCategoryBar from '@/components/shared/TitleCategoryBar';
import { Lesson } from './types';

export interface MatchingEditorProps {
  lesson: Lesson;
  title: string; setTitle: (v: string)=>void;
  category: string; setCategory: (v: string)=>void;
  matchingText: string; setMatchingText: (v: string)=>void;
  matchingBlocksPreview: Array<Array<{ left: string; right: string }>>;
  handleSave: ()=>void; saving: boolean;
  returnToExercises: boolean;
}

export default function MatchingEditor({ lesson, title, setTitle, category, setCategory, matchingText, setMatchingText, matchingBlocksPreview, handleSave, saving, returnToExercises }: MatchingEditorProps) {
  const minPairsOk = matchingBlocksPreview.some(b => b.length >= 2);
  const canSave = title.trim() && minPairsOk;
  return (
    <main className="max-w-6xl mx-auto mt-10 p-6">
      <BackLink lesson={lesson} returnToExercises={returnToExercises} />
      <h1 className="text-2xl font-bold mb-6">🔗 Matching-Lektion bearbeiten</h1>
      <TitleCategoryBar title={title} setTitle={setTitle} category={category} setCategory={setCategory} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border rounded p-6">
          <h3 className="font-semibold mb-4">🔗 Paare eingeben</h3>
          <textarea value={matchingText} onChange={e => setMatchingText(e.target.value)} className="w-full h-96 p-3 border rounded font-mono text-sm" placeholder={'1+2|3\n1-1|0\n1+8|9\n\n2+5|7\n1+2|3\n1-1|0'} />
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <span className="text-sm text-gray-500">Vorschau automatisch.</span>
            <button onClick={handleSave} disabled={saving || !canSave} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400">{saving ? '💾 Speichert...' : '💾 Speichern'}</button>
          </div>
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded p-4 text-sm text-blue-800 space-y-1">
            <p>• Blöcke durch Leerzeile trennen, Zeile: LINKS|RECHTS</p>
            <p>• 2–5 Paare pro Block.</p>
            <p>• Medien: Dateiname (auto → /uploads/…), Pfad (/uploads/…), oder absolute URL; Bilder *.jpg/png/gif/webp, Audio *.mp3/wav/ogg/m4a</p>
          </div>
        </div>
        <div className="bg-white border rounded p-6">
          <h3 className="font-semibold mb-2">👁️ Vorschau</h3>
          {matchingBlocksPreview.length === 0 ? <div className="text-gray-500">Keine Blöcke.</div> : (
            <div className="space-y-3">
              {matchingBlocksPreview.map((block, bi) => (
                <div key={bi} className="border rounded p-3 bg-gray-50">
                  <div className="text-sm text-gray-600 mb-2">Aufgabe {bi + 1}</div>
                  <ul className="list-disc pl-5 text-sm text-gray-700">
                    {block.map((p, idx) => <li key={idx}><strong>{p.left}</strong> ↔ {p.right}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
