"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Lesson, LessonContent } from '../types';
import type { Point, QuestionBlock, Food } from '../snake/types';
import { useSession } from 'next-auth/react';
import { CELL, COLS, ROWS, COLORS } from '../snake/constants';
import { finalizeLesson } from '../../../lib/lessonCompletion';

type QuestionSet = { id: string; name: string; blocks: QuestionBlock[] };
interface Props { lesson: Lesson; courseId: string; completedLessons: string[]; setCompletedLessons: (v: string[] | ((p:string[])=>string[]))=>void; disableCompletion?: boolean; questionSets?: QuestionSet[]; canStart?: boolean; onExposeControls?: (api:{ setDirA:(d:'up'|'down'|'left'|'right')=>void; setDirB:(d:'up'|'down'|'left'|'right')=>void; setRunning:(v:boolean)=>void; restartRound:()=>void; })=>void; onState?: (s:{ snakeA:Point[]; snakeB:Point[]; foods:Food[]; food:Point; scoreA:number; scoreB:number; finished:boolean; gameOverA:boolean; gameOverB:boolean; tickMs:number; targetScore:number; currentQuestion: QuestionBlock | null; running: boolean })=>void; localControlA?: boolean; localControlB?: boolean }

export default function TwoSnakeGame({ lesson, courseId, completedLessons, setCompletedLessons, disableCompletion, questionSets, canStart = true, onExposeControls, onState, localControlA = true, localControlB = true }: Props){
  const { data: session } = useSession();

  // Parse lesson content similar to single-snake logic
  const content = (lesson.content as LessonContent | undefined) || {};
  const targetScore: number = Number(content.targetScore) || 15;
  const difficulty: 'einfach'|'mittel'|'schwer' = content.difficulty === 'schwer' ? 'schwer' : (content.difficulty === 'einfach' ? 'einfach' : 'mittel');
  const MIN_TICK = 300, MAX_TICK = 1500;
  const defaultByDiff = difficulty === 'schwer' ? 400 : (difficulty === 'einfach' ? 600 : 500);
  const requested = Number((content as any).initialSpeedMs);
  const base = Number.isFinite(requested) && requested > 0 ? requested : defaultByDiff;
  const initialSpeed: number = Math.min(MAX_TICK, Math.max(MIN_TICK, base));

  const blocks: QuestionBlock[] = useMemo(()=>{
    const fromContent = Array.isArray((content as any).blocks) ? ((content as any).blocks as QuestionBlock[]) : [];
    if (fromContent && fromContent.length) return fromContent;
    const cq = Array.isArray((content as any)?.questions) ? ((content as any).questions as Array<Record<string, unknown>>) : [];
    if (cq.length) {
      const toText = (v: unknown) => (typeof v === 'string' ? v : String(v ?? ''));
      const built = cq.map((raw)=>{
        const question = toText((raw as any).question ?? (raw as any).prompt ?? (raw as any).title).trim();
        const answersArr = Array.isArray((raw as any).answers) ? (raw as any).answers
          : (Array.isArray((raw as any).options) ? (raw as any).options : (Array.isArray((raw as any).allAnswers) ? (raw as any).allAnswers : []));
        const answers = (answersArr as unknown[]).map(toText).map(s=>s.trim()).filter(Boolean).slice(0,4);
        let correctIdx: number | null = null;
        const cIdx = (raw as any).correctIndex ?? (raw as any).correct;
        if (typeof cIdx === 'number' && Number.isFinite(cIdx)) correctIdx = Math.max(0, Math.min(answers.length-1, Math.floor(cIdx)));
        if (correctIdx == null) {
          const corrList = Array.isArray((raw as any).correctAnswers) ? (raw as any).correctAnswers as unknown[] : ((raw as any).correctAnswer ? [(raw as any).correctAnswer] : []);
          const corrText = (corrList as unknown[]).map(toText).map(s=>s.trim()).filter(Boolean);
          const found = answers.findIndex(a => corrText.includes(a));
          correctIdx = found >= 0 ? found : 0;
        }
        return { question, answers, correct: Math.max(0, Math.min(answers.length-1, correctIdx)) } as QuestionBlock;
      }).filter(b=> b.question && b.answers.length>=2);
      if (built.length) return built;
    }
    const qs = Array.isArray((lesson as any)?.questions) ? ((lesson as any).questions as Array<Record<string, unknown>>) : [];
    if (qs.length) {
      const dedupe = (arr: unknown[]) => Array.from(new Set((arr||[]).map(v=>String(v??'').trim()))).filter(Boolean) as string[];
      const built: QuestionBlock[] = qs.map((qRaw) => {
        const question = String((qRaw.question ?? '') as string).trim();
        const all = Array.isArray(qRaw.allAnswers) ? dedupe(qRaw.allAnswers as unknown[]) : [];
        const corr = Array.isArray(qRaw.correctAnswers) ? dedupe(qRaw.correctAnswers as unknown[]) : (qRaw.correctAnswer ? dedupe([qRaw.correctAnswer]) : []);
        const idx = all.findIndex(a => corr.includes(a));
        const correct = idx >= 0 ? idx : 0;
        const answers = all.slice(0,4);
        return { question, answers, correct };
      }).filter(b => b.question && Array.isArray(b.answers) && b.answers.length >= 2);
      if (built.length) return built;
    }
    return [];
  }, [content, lesson]);

  // Optional: choose from provided question sets
  const [selectedSetId, setSelectedSetId] = useState<string | null>(questionSets?.[0]?.id ?? null);
  const activeBlocks: QuestionBlock[] = useMemo(()=>{
    if(questionSets && questionSets.length){
      const found = questionSets.find(s=> s.id===selectedSetId) || questionSets[0];
      return found ? found.blocks : [];
    }
    return blocks;
  },[questionSets, selectedSetId, blocks]);

  // Board state
  const [snakeA, setSnakeA] = useState<Point[]>([{ x: 6, y: 8 }]);
  const [dirA, setDirA] = useState<Point>({ x: 1, y: 0 });
  const dirARef = useRef(dirA);
  const [snakeB, setSnakeB] = useState<Point[]>([{ x: 25, y: 8 }]);
  const [dirB, setDirB] = useState<Point>({ x: -1, y: 0 });
  const dirBRef = useRef(dirB);

  const [food, setFood] = useState<Point>({ x: 16, y: 16 });
  const [foods, setFoods] = useState<Food[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<QuestionBlock | null>(activeBlocks.length ? activeBlocks[0] : null);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [tickMs, setTickMs] = useState(initialSpeed);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [gameOverA, setGameOverA] = useState(false);
  const [gameOverB, setGameOverB] = useState(false);
  const [marking, setMarking] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const questionIdRef = useRef(0);
  const lastScorePostedRef = useRef(0);

  useEffect(()=>{ dirARef.current = dirA; }, [dirA]);
  useEffect(()=>{ dirBRef.current = dirB; }, [dirB]);

  const randFree = useCallback((occupied: Point[]): Point => {
    while(true){
      const p = { x: Math.floor(Math.random()*COLS), y: Math.floor(Math.random()*ROWS) };
      if(!occupied.some(o=>o.x===p.x && o.y===p.y)) return p;
    }
  },[]);

  const placeClassicFood = useCallback(()=>{
    const occ = [...snakeA, ...snakeB];
    setFood(randFree(occ));
  },[randFree, snakeA, snakeB]);

  const placeAnswerFoods = useCallback((q: QuestionBlock)=>{
    const used: Point[] = [...snakeA, ...snakeB];
    const randPos = ()=>{ while(true){ const x=Math.floor(Math.random()*(COLS-2))+1; const y=Math.floor(Math.random()*(ROWS-2))+1; if(!used.some(p=>p.x===x&&p.y===y)) return {x,y}; } };
    const idx = q.answers.map((_,i)=>i);
    const shuffled = idx.map(v=>[Math.random(),v] as const).sort((a,b)=>a[0]-b[0]).map(([,v])=>v).slice(0,4);
    const fs: Food[] = [];
    shuffled.forEach((ai,i)=>{ const pos = randPos(); used.push(pos); fs.push({ x:pos.x, y:pos.y, color: COLORS[i%COLORS.length], answer: q.answers[ai], correct: ai === q.correct }); });
    setFoods(fs);
  },[snakeA, snakeB]);

  // Init foods
  useEffect(()=>{
    if(activeBlocks.length){
      const q = activeBlocks[Math.floor(Math.random()*activeBlocks.length)];
      setCurrentQuestion(q);
      questionIdRef.current = 0;
      placeAnswerFoods(q);
    } else {
      placeClassicFood();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBlocks.length]);

  // Keyboard: Arrows for A, WASD for B; Space toggles pause
  useEffect(()=>{
    const handler = (e: KeyboardEvent)=>{
      const k = e.key.toLowerCase();
      if(["arrowup","arrowdown","arrowleft","arrowright","w","a","s","d"," "].includes(k)) e.preventDefault();
      if(k===' '){ if(!finished && !(gameOverA && gameOverB)) { setRunning(r => (r ? false : (canStart ? true : r))); } return; }
      if(!running || finished) return;
      // Player A
      if(localControlA){
        if(k==='arrowup' && dirARef.current.y!==1) setDirA({x:0,y:-1});
        else if(k==='arrowdown' && dirARef.current.y!==-1) setDirA({x:0,y:1});
        else if(k==='arrowleft' && dirARef.current.x!==1) setDirA({x:-1,y:0});
        else if(k==='arrowright' && dirARef.current.x!==-1) setDirA({x:1,y:0});
      }
      // Player B
      if(localControlB){
        if(k==='w' && dirBRef.current.y!==1) setDirB({x:0,y:-1});
        else if(k==='s' && dirBRef.current.y!==-1) setDirB({x:0,y:1});
        else if(k==='a' && dirBRef.current.x!==1) setDirB({x:-1,y:0});
        else if(k==='d' && dirBRef.current.x!==-1) setDirB({x:1,y:0});
      }
    };
    window.addEventListener('keydown', handler);
    return ()=> window.removeEventListener('keydown', handler);
  },[running, finished, gameOverA, gameOverB, canStart, localControlA, localControlB]);

  // Game tick (compute both snakes in one pass)
  useEffect(()=>{
    if(!running || finished) return;
    const id = setTimeout(()=>{
      let a = snakeA; let b = snakeB;
      if(gameOverA && gameOverB) return;
      // next heads
      const nextA = { x: a[0].x + dirARef.current.x, y: a[0].y + dirARef.current.y };
      const nextB = { x: b[0].x + dirBRef.current.x, y: b[0].y + dirBRef.current.y };
      let newA = [nextA, ...a];
      let newB = [nextB, ...b];
      // wall / self
      let gA = gameOverA; let gB = gameOverB;
      let nextScoreA = scoreA; let nextScoreB = scoreB;
      if(nextA.x<0||nextA.x>=COLS||nextA.y<0||nextA.y>=ROWS) gA = true;
      if(nextB.x<0||nextB.x>=COLS||nextB.y<0||nextB.y>=ROWS) gB = true;
      if(newA.slice(1).some(p=>p.x===nextA.x && p.y===nextA.y)) gA = true;
      if(newB.slice(1).some(p=>p.x===nextB.x && p.y===nextB.y)) gB = true;
      // head-on
      if(nextA.x===nextB.x && nextA.y===nextB.y){ gA = true; gB = true; }
      // head into other body
      if(newB.slice(1).some(p=>p.x===nextA.x && p.y===nextA.y)) gA = true;
      if(newA.slice(1).some(p=>p.x===nextB.x && p.y===nextB.y)) gB = true;

      // Collision penalties (score -1 for the player who caused it)
      if(gA && !gameOverA){ nextScoreA -= 1; setScoreA(s=>s-1); }
      if(gB && !gameOverB){ nextScoreB -= 1; setScoreB(s=>s-1); }

      // Foods / growth
      if(!gA || !gB){
        if(activeBlocks.length){
          const hitA = !gA && foods.find(f=>f.x===nextA.x && f.y===nextA.y);
          const hitB = !gB && foods.find(f=>f.x===nextB.x && f.y===nextB.y);
          let newQuestionNeeded = false;
          let removeWrongA = false;
          let removeWrongB = false;
          if(hitA){
            if(hitA.correct){ nextScoreA += 1; setScoreA(s=>s+1); newQuestionNeeded = true; }
            else { nextScoreA -= 1; setScoreA(s=>s-1); removeWrongA = true; /* keep growth: do not pop tail */ }
          }
          if(hitB){
            if(hitB.correct){ nextScoreB += 1; setScoreB(s=>s+1); newQuestionNeeded = true; }
            else { nextScoreB -= 1; setScoreB(s=>s-1); removeWrongB = true; /* keep growth: do not pop tail */ }
          }
          if(!hitA && !gA){ newA = newA.slice(0, -1); }
          if(!hitB && !gB){ newB = newB.slice(0, -1); }
          if(newQuestionNeeded && !finished && !(gA && gB)){
            const q = activeBlocks[Math.floor(Math.random()*activeBlocks.length)];
            setCurrentQuestion(q);
            questionIdRef.current += 1;
            placeAnswerFoods(q);
          } else if((removeWrongA || removeWrongB) && foods.length){
            const ax = nextA.x, ay = nextA.y;
            const bx = nextB.x, by = nextB.y;
            setFoods(prev => prev.filter(f => !((removeWrongA && f.x===ax && f.y===ay && !f.correct) || (removeWrongB && f.x===bx && f.y===by && !f.correct))));
          }
        } else {
          const aAte = !gA && (nextA.x===food.x && nextA.y===food.y);
          const bAte = !gB && (nextB.x===food.x && nextB.y===food.y);
          if(!aAte && !gA){ newA = newA.slice(0, -1); }
          if(!bAte && !gB){ newB = newB.slice(0, -1); }
          if(aAte){ nextScoreA += 1; setScoreA(s=>s+1); }
          if(bAte){ nextScoreB += 1; setScoreB(s=>s+1); }
          if(aAte || bAte) placeClassicFood();
        }
      }

      // commit
      if(!gA) setSnakeA(newA); else setGameOverA(true);
      if(!gB) setSnakeB(newB); else setGameOverB(true);

      // Immediate state broadcast (host) to reduce latency for guests
      try{
        onState?.({
          snakeA: newA,
          snakeB: newB,
          foods,
          food,
          scoreA: nextScoreA,
          scoreB: nextScoreB,
          finished,
          gameOverA: gA,
          gameOverB: gB,
          tickMs,
          targetScore,
          currentQuestion,
          running: true
        });
      } catch {}
    }, tickMs);
    return ()=> clearTimeout(id);
  },[tickMs, running, finished, snakeA, snakeB, foods, food, activeBlocks.length, placeAnswerFoods, placeClassicFood, gameOverA, gameOverB, scoreA, scoreB, onState, targetScore, currentQuestion]);

  // Completion: once either reaches targetScore
  useEffect(()=>{
    if(finished) return;
    if(Math.max(scoreA, scoreB) >= targetScore){
      setFinished(true);
      (async()=>{
        try{
    if(disableCompletion) return;
    if(lastScorePostedRef.current >= targetScore) return;
          lastScorePostedRef.current = targetScore;
          setMarking(true);
          await finalizeLesson({ username: session?.user?.username, lessonId: lesson._id, courseId, type: lesson.type, earnedStar: lesson.type !== 'markdown' });
          setCompletedLessons(prev => prev.includes(lesson._id) ? prev : [...prev, lesson._id]);
        } finally { setMarking(false); }
      })();
    }
  },[scoreA, scoreB, targetScore, finished, session?.user?.username, lesson._id, lesson.type, courseId, setCompletedLessons, disableCompletion]);

  const restart = useCallback(()=>{
    setSnakeA([{x:6,y:8}]); setDirA({x:1,y:0}); setGameOverA(false); setScoreA(0);
    setSnakeB([{x:25,y:8}]); setDirB({x:-1,y:0}); setGameOverB(false); setScoreB(0);
    setTickMs(initialSpeed); setRunning(false); setFinished(false);
    if(activeBlocks.length){ const q=activeBlocks[Math.floor(Math.random()*activeBlocks.length)]; setCurrentQuestion(q); questionIdRef.current=0; placeAnswerFoods(q);} else { placeClassicFood(); }
  },[activeBlocks.length, initialSpeed, placeAnswerFoods, placeClassicFood]);

  // Round reset: when any player hits Game Over, restart positions but keep scores and state (except gameOver flags)
  const resetRound = useCallback(()=>{
    setSnakeA([{x:6,y:8}]); setDirA({x:1,y:0}); setGameOverA(false);
    setSnakeB([{x:25,y:8}]); setDirB({x:-1,y:0}); setGameOverB(false);
    // keep scoreA/scoreB, running, tickMs, current question & foods
  },[]);

  // Expose controls to parent (for live mode)
  useEffect(()=>{
    if(!onExposeControls) return;
    const toDir = (setter: typeof setDirA) => (d:'up'|'down'|'left'|'right')=>{
      if(d==='up') setter(prev=> (prev.y!==1? {x:0,y:-1}:prev));
      else if(d==='down') setter(prev=> (prev.y!==-1? {x:0,y:1}:prev));
      else if(d==='left') setter(prev=> (prev.x!==1? {x:-1,y:0}:prev));
      else if(d==='right') setter(prev=> (prev.x!==-1? {x:1,y:0}:prev));
    };
    onExposeControls({ setDirA: toDir(setDirA), setDirB: toDir(setDirB), setRunning, restartRound: resetRound });
    // onExposeControls is stable from parent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[setRunning, resetRound]);

  useEffect(()=>{
    if(!finished && (gameOverA || gameOverB)){
      const t = setTimeout(()=>{ resetRound(); }, 500);
      return ()=> clearTimeout(t);
    }
  },[gameOverA, gameOverB, finished, resetRound]);

  // Rendering (draw only)
  useEffect(()=>{
    const canvas = canvasRef.current; if(!canvas) return;
    const ctx = canvas.getContext('2d'); if(!ctx) return;
    ctx.clearRect(0,0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0, canvas.width, canvas.height);
    // Foods
    if(blocks.length){
      foods.forEach(f=>{ ctx.fillStyle = f.color; ctx.fillRect(f.x*CELL, f.y*CELL, CELL, CELL); });
    } else {
      ctx.fillStyle = '#dc2626'; ctx.fillRect(food.x*CELL, food.y*CELL, CELL, CELL);
    }
  // Snake A (purple) with distinct head color
  snakeA.forEach((p,i)=>{ ctx.beginPath(); ctx.arc(p.x*CELL + CELL/2, p.y*CELL + CELL/2, CELL/2, 0, Math.PI*2); ctx.fillStyle = i===0 ? '#7c3aed' : '#a855f7'; ctx.fill(); });
  // Snake B (orange) with distinct head color
  snakeB.forEach((p,i)=>{ ctx.beginPath(); ctx.arc(p.x*CELL + CELL/2, p.y*CELL + CELL/2, CELL/2, 0, Math.PI*2); ctx.fillStyle = i===0 ? '#ea580c' : '#f97316'; ctx.fill(); });
    // Progress bars
    if(!finished){
      const h = 4;
      ctx.fillStyle = 'rgba(16,185,129,0.5)'; ctx.fillRect(0, canvas.height - h*2 - 2, (Math.min(scoreA,targetScore)/targetScore)*canvas.width, h);
      ctx.fillStyle = 'rgba(37,99,235,0.5)'; ctx.fillRect(0, canvas.height - h, (Math.min(scoreB,targetScore)/targetScore)*canvas.width, h);
    }
    // If not running, broadcast a snapshot so Gäste sehen das Board vor dem Start
    if(!running){
      try{ onState?.({ snakeA, snakeB, foods, food, scoreA, scoreB, finished, gameOverA, gameOverB, tickMs, targetScore, currentQuestion, running: false }); } catch {}
    }
  },[snakeA, snakeB, foods, food, blocks.length, scoreA, scoreB, finished, targetScore, running, gameOverA, gameOverB, tickMs, currentQuestion, onState]);

  return (
    <div className="w-full flex flex-col gap-4">
  {/* Kopfzeile entfernt: Titel-Badge '🐍×2 Gemeinsames Board' */}
      <div className="w-full flex flex-col lg:flex-row gap-6">
        <div className="lg:w-80 p-4 bg-white border rounded space-y-3 h-fit">
          <div className="text-sm"><span className="font-medium">Ziel:</span> {targetScore} Punkte</div>
          {questionSets && questionSets.length > 0 && (
            <div className="text-sm">
              <label className="block text-xs text-gray-600 mb-1">Übung wählen</label>
              <select value={selectedSetId ?? ''} onChange={(e)=> setSelectedSetId(e.target.value)} className="w-full border rounded px-2 py-1 text-sm bg-white">
                {questionSets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div className="text-sm space-y-1">
            <div>Spieler A: <span className="font-semibold text-emerald-700">{scoreA}</span> {gameOverA && <span className="text-red-600">(Game Over)</span>}</div>
            <div>Spieler B: <span className="font-semibold text-blue-700">{scoreB}</span> {gameOverB && <span className="text-red-600">(Game Over)</span>}</div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <button onClick={()=> setRunning(r => (r ? false : (canStart ? true : r)))} disabled={!running && !canStart} className="px-3 py-1 rounded border bg-gray-50 hover:bg-white disabled:opacity-50">{running? 'Pause':'Start'}</button>
            <button onClick={()=> setShowHelp(h=>!h)} className="px-3 py-1 rounded border bg-gray-50 hover:bg-white">{showHelp? 'Hilfe ausblenden':'Hilfe'}</button>
            <span className="inline-flex items-center gap-1 ml-1 select-none">
              <span className="text-[11px] text-gray-600 mr-1">Tempo:</span>
              <button onClick={()=> setTickMs(600)} className="px-2 py-1 rounded border bg-gray-50 hover:bg-white">Langsam</button>
              <button onClick={()=> setTickMs(420)} className="px-2 py-1 rounded border bg-gray-50 hover:bg-white">Mittel</button>
              <button onClick={()=> setTickMs(300)} className="px-2 py-1 rounded border bg-gray-50 hover:bg-white">Schnell</button>
            </span>
          </div>
          {activeBlocks.length>0 && currentQuestion && !(finished) && (
            <div className="text-sm">
              <div className="text-gray-700 whitespace-pre-wrap break-words">{currentQuestion.question}</div>
              {foods.length === 4 && (
                <ul className="mt-2 space-y-1 text-xs">
                  {foods.map((f,i)=> (
                    <li key={i} className="flex items-center gap-2">
                      <span className="inline-block w-4 h-4 rounded-sm border" style={{background:f.color}}></span>
                      <span className="flex-1 break-words">{f.answer}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {showHelp && !finished && (
            <div className="text-[11px] text-gray-600 border rounded p-2 bg-gray-50 leading-snug">
              Steuerung: {localControlA ? 'Spieler A mit Pfeiltasten' : ''}{localControlA && localControlB ? '; ' : ''}{localControlB ? 'Spieler B mit WASD' : ''}. Bei Quiz: richtige Antwortfarbe treffen. Falsche Farbe, Wand oder Kollision beendet den jeweiligen Spieler.
            </div>
          )}
          <div className="pt-3 border-t mt-2">
            {localControlA && (
              <>
                <div className="text-xs text-gray-500 mb-2">Steuerung A (Pfeile)</div>
                <div className="grid grid-cols-3 gap-2 w-56 select-none mb-2">
                  <div />
                  <button onClick={()=> setDirA(d=> (d.y!==1?{x:0,y:-1}:d))} disabled={!running || finished} className="px-3 py-2 rounded-md border bg-gray-50 disabled:opacity-50">↑</button>
                  <div />
                  <button onClick={()=> setDirA(d=> (d.x!==1?{x:-1,y:0}:d))} disabled={!running || finished} className="px-3 py-2 rounded-md border bg-gray-50 disabled:opacity-50">←</button>
                  <div />
                  <button onClick={()=> setDirA(d=> (d.x!==-1?{x:1,y:0}:d))} disabled={!running || finished} className="px-3 py-2 rounded-md border bg-gray-50 disabled:opacity-50">→</button>
                  <div />
                  <button onClick={()=> setDirA(d=> (d.y!==-1?{x:0,y:1}:d))} disabled={!running || finished} className="px-3 py-2 rounded-md border bg-gray-50 disabled:opacity-50">↓</button>
                  <div />
                </div>
              </>
            )}
            {localControlB && (
              <>
                <div className="text-xs text-gray-500 mb-2">Steuerung B (Pfeile)</div>
            <div className="grid grid-cols-3 gap-2 w-56 select-none">
              <div />
                  <button onClick={()=> setDirB(d=> (d.y!==1?{x:0,y:-1}:d))} disabled={!running || finished} className="px-3 py-2 rounded-md border bg-gray-50 disabled:opacity-50">↑</button>
              <div />
                  <button onClick={()=> setDirB(d=> (d.x!==1?{x:-1,y:0}:d))} disabled={!running || finished} className="px-3 py-2 rounded-md border bg-gray-50 disabled:opacity-50">←</button>
              <div />
                  <button onClick={()=> setDirB(d=> (d.x!==-1?{x:1,y:0}:d))} disabled={!running || finished} className="px-3 py-2 rounded-md border bg-gray-50 disabled:opacity-50">→</button>
              <div />
                  <button onClick={()=> setDirB(d=> (d.y!==-1?{x:0,y:1}:d))} disabled={!running || finished} className="px-3 py-2 rounded-md border bg-gray-50 disabled:opacity-50">↓</button>
              <div />
            </div>
              </>
            )}
            <div className="mt-3">
              <button onClick={restart} className="px-3 py-1 text-xs rounded border bg-white hover:bg-gray-50">Neu starten</button>
            </div>
          </div>
        </div>
        <div className="flex-1 flex justify-center items-start">
          <div className="inline-block relative w-full">
            <canvas ref={canvasRef} width={COLS*CELL} height={ROWS*CELL} className="border rounded bg-white block mx-auto" style={{ aspectRatio:'1/1', width:'100%', maxWidth: COLS*CELL }} />
      {!running && !finished && scoreA===0 && scoreB===0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/85 backdrop-blur-sm text-center p-4 gap-2">
        <button onClick={()=> canStart && setRunning(true)} disabled={!canStart} className="px-6 py-3 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md text-sm disabled:opacity-50">{canStart ? 'Start (Leertaste)' : 'Warte auf zweiten Spieler …'}</button>
  <div className="text-[11px] text-gray-600">{[localControlA? 'A: Pfeile': null, localControlB? 'B: Pfeile': null].filter(Boolean).join(' • ')}</div>
              </div>
            )}
            {finished && (
              <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center text-center p-4">
                <div className="text-green-700 font-semibold mb-2">✔️ Ziel erreicht</div>
                <div className="text-xs text-gray-600">Max. Punkte: {Math.max(scoreA, scoreB)} / {targetScore}</div>
              </div>
            )}
          </div>
          {marking && <div className="mt-2 text-xs text-gray-500">Speichere Abschluss…</div>}
        </div>
      </div>
    </div>
  );
}
