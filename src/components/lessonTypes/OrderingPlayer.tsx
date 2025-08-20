"use client";
import { useMemo, useState, useEffect } from 'react';
import type { Lesson } from './types';
import { finalizeLesson } from '../../lib/lessonCompletion';

interface Props { lesson: Lesson; courseId: string; completedLessons: string[]; setCompletedLessons: (v: string[] | ((p:string[])=>string[]))=>void; sessionUsername?: string }
export default function OrderingPlayer({ lesson, courseId, completedLessons, setCompletedLessons, sessionUsername }: Props){
  const original = useMemo(()=> Array.isArray((lesson.content as any)?.items) ? ((lesson.content as any).items as unknown[]).map(v=>String(v||'')) : [], [lesson]);
  const [shuffled, setShuffled] = useState<string[]>([]);
  const [current, setCurrent] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(()=>{ const shuffle=<T,>(arr:T[])=>arr.map(v=>[Math.random(),v] as const).sort((a,b)=>a[0]-b[0]).map(([,v])=>v); const sh = shuffle(original); setShuffled(sh); setCurrent(sh); setChecked(false); setCorrect(false); },[original, lesson._id]);
  const move=(idx:number, dir:-1|1)=>{ setCurrent(arr=>{ const ni= idx+dir; if(ni<0||ni>=arr.length) return arr; const copy=[...arr]; [copy[idx], copy[ni]]=[copy[ni], copy[idx]]; return copy; }); };
  const handleCheck=()=>{ const ok= current.every((v,i)=> v=== original[i]); setChecked(true); setCorrect(ok); if(ok && !completedLessons.includes(lesson._id)){ setSaving(true); (async()=>{ try{ await finalizeLesson({ username: sessionUsername, lessonId: lesson._id, courseId, type: lesson.type, earnedStar: true }); setCompletedLessons(prev=> prev.includes(lesson._id)? prev: [...prev, lesson._id]); } finally { setSaving(false);} })(); } };
  const handleRetry=()=>{ setChecked(false); setCorrect(false); const shuffle=<T,>(arr:T[])=>arr.map(v=>[Math.random(),v] as const).sort((a,b)=>a[0]-b[0]).map(([,v])=>v); const sh= shuffle(original); setShuffled(sh); setCurrent(sh); };
  return <main className="max-w-4xl mx-auto mt-10 p-6">
    <div className="mb-6"><a href={`/kurs/${courseId}`} className="text-blue-600 hover:underline">← Zurück zum Kurs</a></div>
    <h1 className="text-2xl font-bold mb-6">🔢 {lesson.title}</h1>
    <div className="bg-white border rounded p-6 space-y-6">
      <p className="text-sm text-gray-600">Bringe die Elemente in die richtige Reihenfolge.</p>
      <ul className="space-y-3">{current.map((item,idx)=>{ const isCorrectPos= checked && item=== original[idx]; return <li key={idx} className={`border rounded p-3 flex items-start gap-3 ${checked ? (isCorrectPos? 'bg-green-50 border-green-400':'bg-red-50 border-red-300'): 'bg-gray-50 border-gray-300'}`}><div className="flex flex-col gap-1 pt-1"><button disabled={idx===0 || checked} onClick={()=>move(idx,-1)} className={`w-7 h-7 border rounded text-xs ${idx===0||checked? 'opacity-30 cursor-not-allowed':'hover:bg-white'}`}>↑</button><button disabled={idx===current.length-1 || checked} onClick={()=>move(idx,1)} className={`w-7 h-7 border rounded text-xs ${idx===current.length-1||checked? 'opacity-30 cursor-not-allowed':'hover:bg-white'}`}>↓</button></div><div className="flex-1 whitespace-pre-wrap text-sm">{item}</div>{checked && isCorrectPos && <span className="text-green-600 text-sm">✓</span>}</li>; })}</ul>
      <div className="flex gap-3">{!checked && <button onClick={handleCheck} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Prüfen</button>}{checked && !correct && <button onClick={handleRetry} className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700">Neu mischen</button>}{checked && correct && <button onClick={handleRetry} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">Noch einmal</button>}{saving && <div className="text-sm text-gray-500 flex items-center">Speichere…</div>}</div>
      {checked && <div className={`text-sm font-medium ${correct? 'text-green-700':'text-red-700'}`}>{correct? '✔️ Richtig!':'❌ Noch nicht korrekt.'}</div>}
    </div>
  </main>;
}
