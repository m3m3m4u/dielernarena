"use client";
import React, { useEffect, useMemo, useState } from 'react';
import TwoSnakeGame from '../../../components/lessonTypes/twosnake/TwoSnakeGame';

type Exercise = { _id: string; title: string; type: string; courseId: string; content?: any; questions?: any[]; category?: string };

export default function ArenaSnakeVariantTwoPlayer(){
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(()=>{
    let alive = true;
    (async()=>{
      setLoading(true); setError('');
      try{
        const res = await fetch('/api/exercises');
        const data = await res.json();
        if(alive){
          if(data.success){
            // snake braucht Fragen/Blocks
            const list: Exercise[] = (data.exercises||[]).filter((e:Exercise)=>{
              const hasBlocks = !!(e?.content && (Array.isArray(e.content.blocks) || Array.isArray((e.content as any).questions)));
              const hasQuestions = Array.isArray(e.questions) && e.questions.length>0;
              return hasBlocks || hasQuestions;
            });
            setExercises(list);
          } else { setError(data.error || 'Fehler beim Laden'); }
        }
      }catch{ if(alive) setError('Netzwerkfehler'); }
      finally{ if(alive) setLoading(false); }
    })();
    return ()=>{ alive = false; };
  },[]);

  const current = useMemo(()=> exercises.find(e=> e._id===selectedId), [exercises, selectedId]);

  return (
    <main className="max-w-6xl mx-auto mt-10 p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4">🐍 Snake 2× (Variante)</h2>
      <p className="text-gray-700 mb-4">Zwei Spieler auf einem Board. Wähle eine Übung aus „Üben“ – danach ist die Auswahl gesperrt.</p>
      {!locked && (
        <div className="mb-6">
          {loading ? (
            <div className="text-sm text-gray-500">Lade Übungen…</div>
          ) : exercises.length ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {exercises.map(ex => (
                <button key={ex._id} type="button" onClick={()=>{ setSelectedId(ex._id); setLocked(true); }} className="text-left border rounded p-4 bg-white hover:shadow-sm transition flex flex-col gap-2">
                  <h3 className="font-semibold truncate" title={ex.title}>{ex.title}</h3>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded">Übung</span>
                    {ex.category && <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded" title="Fach">{ex.category}</span>}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-600">Keine geeigneten Übungen gefunden. <a className="text-blue-600 hover:underline" href="/ueben">Zu „Üben“</a></div>
          )}
        </div>
      )}

      {current && locked ? (
        <TwoSnakeGame lesson={current as any} courseId={current.courseId || 'exercise-pool'} completedLessons={[]} setCompletedLessons={()=>{}} disableCompletion />
      ) : (
        <div className="p-6 border rounded bg-gray-50 text-sm text-gray-600">Bitte eine Übung auswählen.</div>
      )}

      <div className="mt-6">
        <a href="/arena" className="text-blue-600 hover:underline">← Zurück zur Arena</a>
      </div>
    </main>
  );
}
