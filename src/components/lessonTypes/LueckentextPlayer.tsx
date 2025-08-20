"use client";
import { useState, useEffect, useMemo, ComponentType } from 'react';
import type { Lesson } from './types';
import { finalizeLesson } from '../../lib/lessonCompletion';
import { LessonFooterNavigation } from './index';
import { useMaskedMarkdown } from './lueckentext/useMaskedMarkdown';
import { useGapState } from './lueckentext/useGapState';
import type { Gap, Mode } from './lueckentext/types';

interface Props { lesson: Lesson; courseId: string; completedLessons: string[]; setCompletedLessons: (v: string[] | ((p:string[])=>string[]))=>void; sessionUsername?: string }
export default function LueckentextPlayer({ lesson, courseId, completedLessons, setCompletedLessons, sessionUsername }: Props){
  const [InlineMD, setInlineMD]= useState<ComponentType<any>|null>(null); const [gfm,setGfm]=useState<any>(null);
  useEffect(()=>{ let mounted=true;(async()=>{ const m= await import('react-markdown'); const g= await import('remark-gfm'); if(!mounted) return; setInlineMD(()=> m.default as any); setGfm(()=> (g as any).default ?? g);})(); return ()=>{mounted=false}; },[]);
  const c= (lesson.content||{}) as any; const masked: string= String(c.markdownMasked||''); const gaps: Gap[] = Array.isArray(c.gaps)? c.gaps.map((g:any)=>({id:g.id, answer:String(g.answer)})):[]; const mode: Mode = c.mode==='drag'?'drag':'input';
  const { answersState, setAnswersState, checked, setChecked, correctAll, setCorrectAll, usedAnswers, setUsedAnswers, focusGap, setFocusGap, allFilled, resetChecked } = useGapState({ gaps, mode });
  const { parts } = useMaskedMarkdown({ masked, gaps });
  const bank = useMemo(()=>{ if(mode!=='drag') return [] as string[]; const shuffle=<T,>(arr:T[])=>arr.map(v=>[Math.random(),v] as const).sort((a,b)=>a[0]-b[0]).map(([,v])=>v); return shuffle(gaps.map(g=>g.answer)); },[mode,gaps]);

  const check=()=>{ const allCorrectNow= gaps.every(g=> (answersState[g.id]||'').trim()=== g.answer.trim()); let next={...answersState}; if(mode==='drag' && !allCorrectNow){ for(const g of gaps){ const val=(next[g.id]||'').trim(); if(val && val !== g.answer.trim()) next[g.id]=''; } setAnswersState(next); setUsedAnswers(Object.values(next).filter(Boolean)); } setChecked(true); setCorrectAll(allCorrectNow); if(allCorrectNow && !completedLessons.includes(lesson._id)){ (async()=>{ try{ await finalizeLesson({ username: sessionUsername, lessonId: lesson._id, courseId: lesson.courseId, type: lesson.type, earnedStar: lesson.type !== 'markdown' }); setCompletedLessons(prev=> prev.includes(lesson._id)? prev : [...prev, lesson._id]); } catch{} })(); } };
  const answerStatus=(id:number)=>{ if(!checked) return null; const val=(answersState[id]||'').trim(); if(!val) return null; const answer= gaps.find(g=>g.id===id)?.answer||''; if(val===answer.trim()) return 'correct'; return 'wrong'; };
  const renderPart=(part:string,idx:number)=>{ const m= part.match(/^___(\d+)___$/); if(!m){ if(!InlineMD) return <span key={idx} className="whitespace-pre-wrap">{part}</span>; const Comp=InlineMD; return <span key={idx} className="inline whitespace-pre-wrap"><Comp remarkPlugins={gfm? [gfm]: []} components={{ p: ({children}:{children:any})=> <span className="inline">{children}</span> }}>{part}</Comp></span>; } const id= Number(m[1]); const status= answerStatus(id); if(mode==='input'){ const val= answersState[id]||''; return <input key={idx} value={val} onFocus={()=>setFocusGap(id)} onChange={e=>{ setAnswersState(s=>({...s,[id]:e.target.value})); resetChecked(); }} className={`mx-1 px-3 py-1 border-b outline-none bg-transparent min-w-[80px] text-base transition-colors font-medium tracking-wide ${status==='correct'? 'border-green-600 text-green-700': status==='wrong'? 'border-red-500 text-red-600':'border-blue-600'} ${focusGap===id? 'bg-blue-50':''}`} aria-label={`Lücke ${id}`}/>; } const val= answersState[id]; return <span key={idx} tabIndex={0} onFocus={()=>setFocusGap(id)} onKeyDown={e=>{ if(mode==='drag' && e.key==='Enter'){ const remaining= bank.filter(b=> !Object.values(answersState).includes(b)); if(remaining.length){ setAnswersState(s=>({...s,[id]: remaining[0]})); resetChecked();} } }} onDragOver={e=>{ e.preventDefault(); }} onDrop={e=>{ const ans=e.dataTransfer.getData('text/plain'); if(!ans) return; setAnswersState(s=>({...s,[id]:ans})); setUsedAnswers(u=>[...u,ans]); resetChecked(); }} className={`inline-flex items-center justify-center mx-1 px-3 py-1 min-w-[80px] rounded border text-base font-medium transition-colors ${status==='correct'? 'bg-green-50 border-green-500': status==='wrong'? 'bg-red-50 border-red-500': val? 'bg-blue-50 border-blue-400':'bg-yellow-50 border-yellow-400 text-yellow-700'} ${focusGap===id? 'ring-2 ring-blue-300':''}`} aria-label={`Lücke ${id}`}>{val? val: <span className="opacity-40 select-none">_____</span>}</span>; };

  return <div className="bg-white rounded shadow p-6">
    <div className="text-base leading-8 flex flex-wrap">{parts.map(renderPart)}</div>
    {mode==='drag' && <div className="mt-6">
      <h3 className="font-semibold mb-2 text-base">Antworten</h3>
      <div className="flex flex-wrap gap-3">{bank.map(ans=>{ const used= Object.values(answersState).includes(ans); return <button key={ans} draggable={!used} onDragStart={e=>{ e.dataTransfer.setData('text/plain', ans); }} onClick={()=>{ const free= gaps.find(g=> !answersState[g.id]); if(free) setAnswersState(s=>({...s,[free.id]: ans})); resetChecked(); }} disabled={used} className={`px-3 py-1.5 text-sm rounded border font-medium transition-colors ${used? 'bg-gray-100 text-gray-400 cursor-not-allowed':'bg-white hover:bg-gray-50 border-blue-300'}`} aria-label={`Antwort ${ans}${used? ' (verwendet)':''}`}>{ans}</button>; })}</div>
    </div>}
    <div className="mt-6 flex items-center gap-3 flex-wrap">
      <button onClick={check} disabled={checked && correctAll} className={`px-5 py-2.5 rounded text-white text-base font-semibold ${checked && correctAll? 'bg-green-500 cursor-default':'bg-blue-600 hover:bg-blue-700'}`}>{checked ? (correctAll? '✔️ Fertig':'Erneut prüfen'): 'Überprüfen'}</button>
      {checked && !correctAll && <span className="text-base text-red-600">Noch nicht alles korrekt.</span>}
      {checked && correctAll && <span className="text-base text-green-600">Alle richtig!</span>}
      {!allFilled && mode==='input' && <span className="text-sm text-gray-500">Alle Felder ausfüllen.</span>}
    </div>
    <LessonFooterNavigation allLessons={[]} currentLessonId={lesson._id} courseId={courseId} completedLessons={completedLessons}/>
  </div>;
}
