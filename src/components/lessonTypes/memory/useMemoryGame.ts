import { useCallback } from 'react';
import type { MemoryCard } from './types';

interface Params {
  cards: MemoryCard[];
  setCards: React.Dispatch<React.SetStateAction<MemoryCard[]>>;
  flippedIndices: number[];
  setFlippedIndices: React.Dispatch<React.SetStateAction<number[]>>;
  moves: number;
  setMoves: React.Dispatch<React.SetStateAction<number>>;
  finished: boolean;
  setFinished: React.Dispatch<React.SetStateAction<boolean>>;
  lock: boolean;
  setLock: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useMemoryGame({ cards, setCards, flippedIndices, setFlippedIndices, moves, setMoves, finished, setFinished, lock, setLock }: Params){
  const handleFlip = useCallback((index:number)=>{
    if(lock) return;
    setCards(prev=>{
      if(prev[index].flipped || prev[index].matched) return prev;
      const copy = prev.map(c=>({...c}));
      copy[index].flipped = true;
      const newFlipped=[...flippedIndices, index];
      setFlippedIndices(newFlipped);
      if(newFlipped.length===2){
        setMoves(m=>m+1);
        setLock(true);
        const [i1,i2]= newFlipped; const c1= copy[i1]; const c2= copy[i2];
        if(c1.pair===c2.pair && c1.side!==c2.side){
          setTimeout(()=>{ copy[i1].matched=true; copy[i2].matched=true; setFlippedIndices([]); setLock(false); if(copy.every(c=>c.matched)) setFinished(true); },400);
        } else {
          setTimeout(()=>{ copy[i1].flipped=false; copy[i2].flipped=false; setFlippedIndices([]); setLock(false); },800);
        }
      }
      return copy;
    });
  },[lock, flippedIndices, setCards, setFlippedIndices, setMoves, setLock, setFinished]);

  const restart = useCallback(()=>{
    // Trigger Neu-Mischen indem wir lessonId/pairsKey abhängigen Effekt neu auslösen könnten – hier vereinfachend: Karten erneut shufflen
    setCards(prev=>{ const temp=[...prev].map(c=>({...c, flipped:false, matched:false})); for(let i=temp.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [temp[i], temp[j]]=[temp[j], temp[i]];} return temp; });
    setFlippedIndices([]); setMoves(0); setFinished(false); setLock(false);
  },[setCards, setFlippedIndices, setMoves, setFinished, setLock]);

  return { handleFlip, restart };
}
