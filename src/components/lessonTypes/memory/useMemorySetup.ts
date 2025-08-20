import { useMemo, useState, useEffect } from 'react';
import type { MemoryPair, MemoryCard } from './types';
import type { Lesson } from '../types';

interface Params { content: any; lessonId: string; }

export function useMemorySetup({ content, lessonId }: Params){
  const initialPairs = useMemo(()=>{ let pairs: MemoryPair[] = Array.isArray(content.pairs)? content.pairs: []; if((!pairs||pairs.length===0) && typeof content.raw==='string'){ const lines= content.raw.split(/\n+/).map((l:string)=>l.trim()).filter(Boolean); const seen=new Set<string>(); const detect=(v:string)=>(/\.(png|jpe?g|gif|webp|svg)$/i.test(v)?'image':(/\.(mp3|wav|ogg|m4a)$/i.test(v)?'audio':'text')); const acc: MemoryPair[]=[]; for(const line of lines){ const [l,r]= line.split('|'); if(!l||!r) continue; const L=l.trim(); const R=r.trim(); const key=(L+':::'+R).toLowerCase(); if(seen.has(key) || L.toLowerCase()===R.toLowerCase()) continue; seen.add(key); acc.push({ a:{kind:detect(L), value:L}, b:{kind:detect(R), value:R} }); if(acc.length===8) break; } pairs=acc; } return pairs.slice(0,8); },[content.pairs, content.raw]);
  const pairsKey = useMemo(()=> initialPairs.map(p=>`${p.a.value}|${p.b.value}`).join(';'),[initialPairs]);
  const [cards, setCards]= useState<MemoryCard[]>([]);
  const [flippedIndices, setFlippedIndices]= useState<number[]>([]);
  const [moves, setMoves]= useState(0);
  const [finished, setFinished]= useState(false);
  const [lock, setLock]= useState(false);

  useEffect(()=>{ if(!initialPairs.length) return; const temp: MemoryCard[]=[]; initialPairs.forEach((p,idx)=>{ temp.push({ id:`p${idx}a`, pair:idx, side:'a', kind:p.a.kind, value:p.a.value, flipped:false, matched:false}); temp.push({ id:`p${idx}b`, pair:idx, side:'b', kind:p.b.kind, value:p.b.value, flipped:false, matched:false});}); for(let i=temp.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [temp[i], temp[j]]=[temp[j], temp[i]];} setCards(temp); setFlippedIndices([]); setMoves(0); setFinished(false); setLock(false); },[lessonId, pairsKey, initialPairs]);

  return { initialPairs, pairsKey, cards, setCards, flippedIndices, setFlippedIndices, moves, setMoves, finished, setFinished, lock, setLock };
}
