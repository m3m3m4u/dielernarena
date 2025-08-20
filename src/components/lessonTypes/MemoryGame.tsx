"use client";
import { useSession } from 'next-auth/react';
import type { Lesson } from './types';
import { finalizeLesson } from '../../lib/lessonCompletion';
import { useState, useEffect } from 'react';
import { useMemorySetup } from './memory/useMemorySetup';
import { useMemoryGame } from './memory/useMemoryGame';
import type { MemoryCard } from './memory/types';
import { resolveMediaPath } from '../../lib/media';

interface Props { lesson: Lesson; onCompleted: () => void; completedLessons: string[]; setCompletedLessons?: (v: string[] | ((p:string[])=>string[]))=>void }
export default function MemoryGame({ lesson, onCompleted, completedLessons, setCompletedLessons }: Props){
  const { data: session } = useSession();
  const content = (lesson.content||{}) as any;
  const { initialPairs, cards, setCards, flippedIndices, setFlippedIndices, moves, setMoves, finished, setFinished, lock, setLock } = useMemorySetup({ content, lessonId: lesson._id });
  const { handleFlip, restart } = useMemoryGame({ cards, setCards, flippedIndices, setFlippedIndices, moves, setMoves, finished, setFinished, lock, setLock });
  const [marking, setMarking] = useState(false);
  const isAlreadyDone = completedLessons.includes(lesson._id);

  useEffect(()=>{ if(finished && !isAlreadyDone){ (async()=>{ try{ const username=session?.user?.username; setMarking(true); await finalizeLesson({ username, lessonId: lesson._id, courseId: lesson.courseId, type: lesson.type, earnedStar: lesson.type !== 'markdown' }); if(setCompletedLessons){ setCompletedLessons(prev=> prev.includes(lesson._id)? prev : [...prev, lesson._id]); } } finally { setMarking(false); onCompleted(); } })(); } },[finished, isAlreadyDone, lesson._id, lesson.courseId, lesson.type, onCompleted, session?.user?.username, setCompletedLessons]);

  const renderCardFace=(card:MemoryCard)=>{ const p = resolveMediaPath(card.value); if(card.kind==='image') return <img src={p} alt="" className="w-full h-full object-contain" onError={(e)=>{ const el=e.currentTarget as HTMLImageElement; const name=(p.split('/').pop()||''); if(!el.dataset.fallback1 && name){ el.dataset.fallback1='1'; el.src = `/media/${name}`; } else if(!el.dataset.fallback2 && name){ el.dataset.fallback2='1'; el.src = `/uploads/${name}`; } }} />; if(card.kind==='audio') return <audio controls className="w-full h-full"><source src={p}/></audio>; return <span className="text-xs p-1 break-words leading-tight text-center block">{card.value}</span>; };

  return <div>
    {initialPairs.length===0 && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">Keine Memory-Paare vorhanden.</div>}
    <div className="grid gap-4" style={{gridTemplateColumns:`repeat(${Math.min(4, Math.ceil(Math.sqrt(cards.length||1)))}, minmax(0,1fr))`}}>
      {cards.map((card,idx)=>{ const flipped= card.flipped||card.matched; return <button key={card.id} onClick={()=>handleFlip(idx)} disabled={card.flipped||card.matched||lock} className={`relative h-32 md:h-40 border rounded-lg flex items-center justify-center bg-white transition-transform duration-300 ${flipped?'shadow-inner':'shadow hover:shadow-md'} ${card.matched?'border-green-500':'border-gray-200'}`}>{flipped ? <div className="w-full h-full flex items-center justify-center p-2">{renderCardFace(card)}</div>: <div className="w-full h-full flex items-center justify-center font-semibold text-gray-500 select-none">🧠</div>}</button>; })}
    </div>
    <div className="mt-6 flex items-center gap-4 flex-wrap">
      {finished ? <span className="text-green-600 font-medium">✔️ Alle Paare gefunden!</span>: <span className="text-gray-600 text-sm">Finde alle Paare.</span>}
      <span className="text-sm text-gray-500">Züge: {moves}</span>
      <button onClick={restart} className="text-xs px-3 py-1 border rounded hover:bg-gray-50">Neu mischen</button>
      {marking && <span className="text-sm text-gray-500">Speichere Abschluss…</span>}
    </div>
  </div>;
}
