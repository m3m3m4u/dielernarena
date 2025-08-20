"use client";
import { useState, useEffect } from 'react';
import { resolveMediaPath, isImagePath, isAudioPath } from '../../lib/media';

interface MatchingProps { question: { allAnswers: string[]; correctAnswers?: string[] }; onSolved: () => void; }
export default function MatchingUI({ question, onSolved }: MatchingProps){
  const [leftOptions, setLeftOptions] = useState<string[]>([]);
  const [rightOptions, setRightOptions] = useState<string[]>([]);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [matched, setMatched] = useState<Record<string,string>>({});
  const [errorPair, setErrorPair] = useState<{ left: string; right: string } | null>(null);
  const renderOption = (value:string)=>{ 
    const p = resolveMediaPath(value);
    if(isImagePath(p)) return <div className="w-full flex items-center justify-center">
      <img 
        src={p} 
        alt="" 
        className="max-h-36 w-auto object-contain border rounded bg-white"
        onError={(e)=>{ const el=e.currentTarget as HTMLImageElement; const name=(p.split('/').pop()||''); if(!el.dataset.fallback1 && name){ el.dataset.fallback1='1'; el.src=`/media/${name}`; } else if(!el.dataset.fallback2 && name){ el.dataset.fallback2='1'; el.src=`/uploads/${name}`; } }}
      />
    </div>;
    if(isAudioPath(p)) return <div className="w-full flex items-center justify-center">
      <audio controls className="w-full max-w-xs border rounded bg-white p-1">
        <source src={p}/>
        <source src={p.replace('/media/audio/','/media/')} />
        <source src={p.replace('/media/audio/','/uploads/')} />
      </audio>
    </div>;
    return <span className="break-words">{value}</span>; };
  useEffect(()=>{ const pairs=(question.correctAnswers||[]).map(k=>{ const [l,r]= String(k).split('=>'); return { l:(l||'').trim(), r:(r||'').trim() }; }).filter(p=>p.l&&p.r); const lefts=pairs.map(p=>p.l); const rights=pairs.map(p=>p.r); const shuffle=<T,>(arr:T[])=>arr.map(v=>[Math.random(),v] as const).sort((a,b)=>a[0]-b[0]).map(([,v])=>v); setLeftOptions(shuffle(lefts)); setRightOptions(shuffle(rights)); setMatched({}); setSelectedLeft(null); setErrorPair(null); },[question.correctAnswers]);
  const isCorrectPair=(l:string,r:string)=> (question.correctAnswers||[]).includes(`${l}=>${r}`);
  const allMatched= Object.keys(matched).length>0 && Object.keys(matched).length === (question.correctAnswers?.length||0);
  useEffect(()=>{ if(allMatched) onSolved(); },[allMatched,onSolved]);
  const handleLeftClick=(l:string)=>{ if(matched[l]) return; setSelectedLeft(prev=> prev===l? null: l); };
  const handleRightClick=(r:string)=>{ if(!selectedLeft) return; const rightUsed = Object.values(matched).includes(r); if(rightUsed) return; const l= selectedLeft; if(isCorrectPair(l,r)){ setMatched(prev=>({...prev, [l]:r})); setSelectedLeft(null); } else { setErrorPair({ left:l, right:r }); setTimeout(()=> setErrorPair(null),700); setSelectedLeft(null); } };
  const isLeftMatched=(l:string)=> Boolean(matched[l]); const isRightMatched=(r:string)=> Object.values(matched).includes(r);
  return <div className="grid grid-cols-2 gap-6">
    <div className="space-y-2">{leftOptions.map(l=>{ const matchedRight= matched[l]; const isErr= errorPair?.left===l; const base='w-full p-4 min-h-[180px] h-[180px] flex items-center justify-center border rounded transition-colors bg-white'; const cls= matchedRight? `${base} border-green-500 bg-green-50 text-green-800 cursor-default`: isErr? `${base} border-red-500 bg-red-50 text-red-800`: (selectedLeft===l)? `${base} border-blue-500 bg-blue-50`: `${base} border-gray-200 hover:bg-gray-50`; return <button key={l} onClick={()=>handleLeftClick(l)} disabled={Boolean(matchedRight)} className={cls} aria-label={l}>{renderOption(l)}</button>; })}</div>
    <div className="space-y-2">{rightOptions.map(r=>{ const isUsed=isRightMatched(r); const isErr= errorPair?.right===r; const base='w-full p-4 min-h-[180px] h-[180px] flex items-center justify-center border rounded transition-colors bg-white'; const cls= isUsed? `${base} border-green-500 bg-green-50 text-green-800 cursor-default`: isErr? `${base} border-red-500 bg-red-50 text-red-800`: `${base} border-gray-200 hover:bg-gray-50`; return <button key={r} onClick={()=>handleRightClick(r)} disabled={isUsed} className={cls} aria-label={r}>{renderOption(r)}</button>; })}</div>
  </div>;
}
