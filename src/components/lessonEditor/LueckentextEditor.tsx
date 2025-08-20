"use client";
import BackLink from '@/components/shared/BackLink';
import TitleCategoryBar from '@/components/shared/TitleCategoryBar';
import MarkdownPreview from '@/components/shared/MarkdownPreview';
import { Lesson } from './types';

export interface LueckentextEditorProps {
  lesson: Lesson;
  title: string; setTitle: (v: string)=>void;
  category: string; setCategory: (v: string)=>void;
  ltMarkdown: string; setLtMarkdown: (v: string)=>void;
  ltMode: 'input'|'drag'; setLtMode: (m: 'input'|'drag')=>void;
  handleSave: ()=>void; saving: boolean;
  returnToExercises: boolean;
}

export default function LueckentextEditor({ lesson, title, setTitle, category, setCategory, ltMarkdown, setLtMarkdown, ltMode, setLtMode, handleSave, saving, returnToExercises }: LueckentextEditorProps) {
  const answers = Array.from(ltMarkdown.matchAll(/\*(.+?)\*/g)).map(m => (m as RegExpMatchArray)[1].trim()).filter(Boolean);
  const masked = ltMarkdown.replace(/\*(.+?)\*/g, (_full, inner) => {
    const idx = answers.indexOf(inner.trim());
    const id = idx === -1 ? answers.length : (idx + 1);
    return `___${id}___`;
  });
  const highlightMarkdown = masked.replace(/___(\d+)___/g, (_m, g1) => `**[${g1}]**`);
  return (
    <main className="max-w-6xl mx-auto mt-10 p-6">
      <BackLink lesson={lesson} returnToExercises={returnToExercises} />
      <h1 className="text-2xl font-bold mb-6">🧩 Lückentext bearbeiten</h1>
      <TitleCategoryBar title={title} setTitle={setTitle} category={category} setCategory={setCategory} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border rounded p-6">
          <h3 className="font-semibold mb-4">🧩 Text mit Lücken</h3>
          <div className="mb-3 flex items-center gap-4 text-sm">
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="radio" name="ltMode" value="input" checked={ltMode==='input'} onChange={() => setLtMode('input')} />
              <span>Eingabe</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="radio" name="ltMode" value="drag" checked={ltMode==='drag'} onChange={() => setLtMode('drag')} />
              <span>Drag & Drop</span>
            </label>
            <span className="text-gray-400 text-xs">(Modus umschalten)</span>
          </div>
          <textarea value={ltMarkdown} onChange={e => setLtMarkdown(e.target.value)} className="w-full h-96 p-3 border rounded font-mono text-sm" placeholder="Die Hauptstadt von *Österreich* ist *Wien*." />
          <p className="mt-2 text-xs text-gray-500">Escape mit \\*: z.B. \\*kein Gap\\*</p>
          <div className="mt-4 flex gap-3">
            <button onClick={handleSave} disabled={saving || !title.trim() || answers.length===0} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400">{saving ? '💾 Speichert...' : '💾 Speichern'}</button>
          </div>
        </div>
        <div className="bg-white border rounded p-6">
          <h3 className="font-semibold mb-4">👁️ Vorschau</h3>
          <div className="prose max-w-none border rounded p-3 bg-gray-50 overflow-auto h-96 text-sm">
            <MarkdownPreview markdown={highlightMarkdown} />
          </div>
          {answers.length > 0 && <div className="mt-4 text-xs flex flex-wrap gap-2">{answers.map((a,i)=><span key={i} className="px-2 py-1 bg-green-50 border border-green-300 rounded">{i+1}:{a}</span>)}</div>}
        </div>
      </div>
    </main>
  );
}
