"use client";
import BackLink from '@/components/shared/BackLink';
import TitleCategoryBar from '@/components/shared/TitleCategoryBar';
import { Lesson } from './types';
import { Dispatch, SetStateAction, useState } from 'react';

export interface TextAnswerEditorProps {
  lesson: Lesson;
  title: string; setTitle: (v: string)=>void;
  category: string; setCategory: (v: string)=>void;
  setLesson: Dispatch<SetStateAction<Lesson | null>>;
  saving: boolean; setSaving: Dispatch<SetStateAction<boolean>>;
  returnToExercises: boolean;
}

interface Block { question: string; answers: string[]; media?: string }

export default function TextAnswerEditor({ lesson, title, setTitle, category, setCategory, setLesson, saving, setSaving, returnToExercises }: TextAnswerEditorProps) {
  const c = (lesson.content || {}) as any;
  const [raw, setRaw] = useState<string>(String(c.raw || ''));
  const [caseSensitive, setCaseSensitive] = useState<boolean>(!!c.caseSensitive);
  const [allowReveal, setAllowReveal] = useState<boolean>(!!c.allowReveal);
  const parseBlocks = (text: string): Block[] => text.replace(/\r/g,'').split(/\n\s*\n+/).map(b=>b.trim()).filter(Boolean).map(b=>{
    const lines = b.split(/\n+/).map(l=>l.trim()).filter(Boolean);
    if (!lines.length) return null;
    let first = lines[0];
    let media: string | undefined;
    const m = first.match(/^(.+?)\s*\[(.+?)\]$/);
    if (m) { first = m[1].trim(); media = m[2].trim(); }
    const answers = lines.slice(1);
    if (!first || answers.length===0) return null;
    return { question: first, answers, media } as Block;
  }).filter(Boolean) as Block[];
  const blocks = parseBlocks(raw);
  const canSave = title.trim() && blocks.length>0;

  const saveWithParsed = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        type: lesson.type,
        content: {
          raw,
          blocks: blocks.map(b=>({ question: b.question, answers: b.answers, media: b.media })),
          caseSensitive,
          allowReveal,
          question: blocks[0].question,
          answer: blocks[0].answers[0]
        }
      };
      const res = await fetch(`/api/kurs/${lesson.courseId}/lektionen/${lesson._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.lesson) setLesson(data.lesson);
      } else {
        console.error('Speichern fehlgeschlagen');
      }
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  return (
    <main className="max-w-6xl mx-auto mt-10 p-6">
      <BackLink lesson={lesson} returnToExercises={returnToExercises} />
      <h1 className="text-2xl font-bold mb-6">✍️ Text-Antwort Lektion bearbeiten</h1>
      <TitleCategoryBar title={title} setTitle={setTitle} category={category} setCategory={setCategory} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border rounded p-6 space-y-4">
          <h3 className="font-semibold">✍️ Fragen & Antworten (Blöcke)</h3>
          <p className="text-xs text-gray-600">Jeder Block: erste Zeile Frage optional mit <code className="bg-gray-100 px-1 rounded">[media.jpg]</code> oder <code className="bg-gray-100 px-1 rounded">[audio.mp3]</code>, folgende Zeilen = korrekte Antworten. Leerzeile trennt Blöcke.</p>
          <textarea value={raw} onChange={e=>setRaw(e.target.value)} className="w-full h-96 p-3 border rounded font-mono text-sm" placeholder={'Was ist die Hauptstadt von Frankreich? [paris.jpg]\nParis\n\nNenne eine Primzahl kleiner als 5\n2\n3\n5'} />
          <div className="flex flex-col gap-2 text-xs">
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={caseSensitive} onChange={e=>setCaseSensitive(e.target.checked)} /> Groß-/Kleinschreibung beachten</label>
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={allowReveal} onChange={e=>setAllowReveal(e.target.checked)} /> Spieler darf Lösung anzeigen (Frage kommt am Ende erneut)</label>
          </div>
          <div>
            <button onClick={saveWithParsed} disabled={saving || !canSave} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400">{saving? '💾 Speichert...' : '💾 Speichern'}</button>
          </div>
        </div>
        <div className="bg-white border rounded p-6 space-y-4">
          <h3 className="font-semibold">👁️ Vorschau ({blocks.length})</h3>
          {blocks.length===0 && <div className="text-gray-400 text-sm">Keine gültigen Blöcke.</div>}
          {blocks.length>0 && (
            <ol className="list-decimal pl-5 space-y-3 text-sm">
              {blocks.map((b,i)=>(
                <li key={i} className="bg-gray-50 border rounded p-3">
                  <div className="font-medium mb-1 flex items-center gap-2">{b.question}{b.media && <span className="text-xs text-blue-600 break-all">📎 {b.media}</span>}</div>
                  <ul className="list-disc pl-5 text-xs text-gray-700 space-y-0.5">
                    {b.answers.map((a,ai)=><li key={ai}><code className="bg-white border px-1 rounded">{a}</code></li>)}
                  </ul>
                </li>
              ))}
            </ol>
          )}
          <div className="text-[10px] text-gray-500 flex flex-wrap gap-4">
            <span>Ø Antworten: {blocks.length? Math.round(blocks.reduce((s,b)=>s+b.answers.length,0)/blocks.length):0}</span>
            <span>Case: {caseSensitive? 'sensitiv':'ignoriert'}</span>
            {allowReveal && <span>Lösung anzeigen erlaubt</span>}
            <span>Speichern aktiviert wenn mindestens 1 Block</span>
          </div>
        </div>
      </div>
    </main>
  );
}
