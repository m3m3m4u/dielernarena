"use client";
import React, { useRef, useState, useEffect } from 'react';
import type { Lesson, LessonContent } from '../types';
import { useSession } from 'next-auth/react';
import { finalizeLesson } from '../../../lib/lessonCompletion';
import { buildQuestionBlocks } from '../plane/questions';

interface Props { lesson: Lesson; courseId: string; completedLessons: string[]; setCompletedLessons: (v: string[] | ((p:string[])=>string[]))=>void; }

const W = 960; const H = 540; const FORCE_MIN_DPR=2; const MAX_LIVES=3; const DEFAULT_TARGET_SCORE=15;
interface Orb { x:number;y:number;r:number;color:string;correct:boolean;speed:number;spawnEntry:SpawnEntry;_hit?:boolean;_remove?:boolean; }
interface Projectile { x:number;y:number;vx:number;r:number;_hit?:boolean; }
interface Particle { x:number;y:number;vx:number;vy:number;life:number;maxLife:number;color:string;size:number; }
interface SpawnEntry { color:string;correct:boolean;laneIndex:number;nextSpawn:number; }

export default function SpaceImpactGame({ lesson, courseId, completedLessons, setCompletedLessons }:Props){
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const wrapperRef=useRef<HTMLDivElement|null>(null);
  const hudRef=useRef<HTMLDivElement|null>(null);
  const bottomInfoRef=useRef<HTMLDivElement|null>(null);
  const { data: session } = useSession();

  const [running,setRunning]=useState(false);
  const [paused,setPaused]=useState(false);
  const [gameOver,setGameOver]=useState(false);
  const [finished,setFinished]=useState(false);
  const [score,setScore]=useState(0);
  const [lives,setLives]=useState(MAX_LIVES);
  const [questionText,setQuestionText]=useState('');
  const [currentAnswers,setCurrentAnswers]=useState<{text:string;correct:boolean;color:string}[]>([]);
  const [marking,setMarking]=useState(false);
  const [isFullscreen,setIsFullscreen]=useState(false);
  const [gamePixelWidth,setGamePixelWidth]=useState<number|undefined>(undefined);

  const blocks=buildQuestionBlocks(lesson);
  const targetScore=Number((lesson.content as LessonContent | undefined)?.targetScore)||DEFAULT_TARGET_SCORE;
  const questionPoolRef=useRef<{idx:number;weight:number}[]>([]); const currentQuestionIndexRef=useRef(0); const spawnEntriesRef=useRef<SpawnEntry[]>([]);
  const initQuestionPool=()=>{ questionPoolRef.current=blocks.map((_,i)=>({idx:i,weight:5})); };
  const pickNextQuestionIndex=():number=>{ if(!questionPoolRef.current.length) initQuestionPool(); const total=questionPoolRef.current.reduce((s,q)=>s+q.weight,0); let r=Math.random()*total; for(const q of questionPoolRef.current){ if(r<q.weight) return q.idx; r-=q.weight; } return questionPoolRef.current[0].idx; };
  const increaseWeight=(idx:number,amount:number)=>{ const e=questionPoolRef.current.find(q=>q.idx===idx); if(e) e.weight=Math.min(e.weight+amount,60); }; const decreaseWeight=(idx:number,factor:number)=>{ const e=questionPoolRef.current.find(q=>q.idx===idx); if(e) e.weight=Math.max(e.weight*factor,1); };
  const colorPalette=['red','blue','green','yellow']; const colorHex:Record<string,string>={red:'#e53935',blue:'#1e88e5',green:'#43a047',yellow:'#fdd835',black:'#111'}; const pickColorForIndex=(i:number)=>colorPalette[i%colorPalette.length];
  const loadQuestionOriginal=(idx?:number)=>{
    if(idx==null||idx>=blocks.length) idx=pickNextQuestionIndex();
    currentQuestionIndexRef.current=idx;
    const q=blocks[idx];
      setQuestionText((q as unknown as { question?: string; prompt?: string; title?: string }).question || (q as unknown as { prompt?: string }).prompt || (q as unknown as { title?: string }).title || '');
    let sourceUnknown = (q as unknown as { answers?: unknown; options?: unknown; choices?: unknown; alternatives?: unknown; antworten?: unknown }).answers
      || (q as unknown as { options?: unknown }).options
      || (q as unknown as { choices?: unknown }).choices
      || (q as unknown as { alternatives?: unknown }).alternatives
      || (q as unknown as { antworten?: unknown }).antworten
      || [];
    if((!Array.isArray(sourceUnknown) || !sourceUnknown.length)){
        const cand = Object.values(q as unknown as Record<string, unknown>).find((v)=> Array.isArray(v) && v.length>0 && v.every((e)=> typeof e==='string' || typeof e==='object'));
      if(cand) sourceUnknown = cand as unknown[];
    }
    const rawAnswers = (Array.isArray(sourceUnknown)? sourceUnknown: []).map((a)=>{
      if(a==null) return { text:'', correct:false };
      if(typeof a==='string') return { text:a, correct:false };
      const obj = a as Record<string, unknown>;
      const text = (obj.text || obj.answer || obj.value || obj.label || obj.title || obj.content || '') as string;
      const correct = Boolean(obj.correct || obj.isCorrect || obj.right || obj.valid);
      return { text:String(text), correct };
    }).filter(a=> a.text !== '' || a.correct);
    const useAnswers = rawAnswers.length? rawAnswers : [{ text:'(keine Antworten gefunden)', correct:false }];
  // Neue Antwort-Kugeln erst nach Delay spawnen lassen, damit Spieler Feedback sieht
  const delaySeconds = 2.0; // ~2000 ms
  spawnEntriesRef.current = useAnswers.map((a,i)=>({ color:pickColorForIndex(i), correct:a.correct, laneIndex:i, nextSpawn: gameTimeRef.current + delaySeconds }));
    setCurrentAnswers(useAnswers.map((a,i)=> ({...a, color: pickColorForIndex(i)})));
  };

  // Entities
  const shipRef=useRef({x:70,y:H/2,r:22,speed:320});
  const projectilesRef=useRef<Projectile[]>([]);
  const orbsRef=useRef<Orb[]>([]);
  const particlesRef=useRef<Particle[]>([]);
  const baseOrbSpeedRef=useRef(70);
  const gameTimeRef=useRef(0);
  const shootCooldownRef=useRef(0);
  const inputRef=useRef({up:false,down:false,shoot:false});
  const questionSolvedRef=useRef(false);
  const lastTimeRef=useRef(0); const lastFrameDtRef=useRef(0);
  const wrongFlashRef=useRef(0); const correctFlashRef=useRef(0); const shakeRef=useRef(0);

  const toggleFullscreen=()=>{ const el=wrapperRef.current; if(!el) return; if(!document.fullscreenElement){ el.requestFullscreen?.(); } else { document.exitFullscreen?.(); } };
  useEffect(()=>{ const h=()=>setIsFullscreen(!!document.fullscreenElement); document.addEventListener('fullscreenchange',h); return ()=> document.removeEventListener('fullscreenchange',h); },[]);

  useEffect(()=>{ const kd=(e:KeyboardEvent)=>{ if(e.code==='ArrowUp'||e.code==='KeyW'){inputRef.current.up=true; e.preventDefault();} if(e.code==='ArrowDown'||e.code==='KeyS'){inputRef.current.down=true; e.preventDefault();} if(e.code==='Space'){inputRef.current.shoot=true; e.preventDefault();} if(e.code==='KeyP'){ setPaused(p=>!p);} if(!running && e.code==='Enter'){ start(); } if(gameOver && e.code==='Enter'){ restart(); } }; const ku=(e:KeyboardEvent)=>{ if(e.code==='ArrowUp'||e.code==='KeyW') inputRef.current.up=false; if(e.code==='ArrowDown'||e.code==='KeyS') inputRef.current.down=false; if(e.code==='Space') inputRef.current.shoot=false; }; window.addEventListener('keydown',kd); window.addEventListener('keyup',ku); return ()=>{ window.removeEventListener('keydown',kd); window.removeEventListener('keyup',ku); }; },[running,gameOver]);

  useEffect(()=>{ const canvas=canvasRef.current; if(!canvas) return; const ctx=canvas.getContext('2d'); if(!ctx) return; const sys=window.devicePixelRatio||1; const dpr=Math.max(sys,FORCE_MIN_DPR); canvas.width=W*dpr; canvas.height=H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); ctx.imageSmoothingEnabled=true; (ctx as unknown as { imageSmoothingQuality?: string }).imageSmoothingQuality='high'; },[]);

  // Neue Version: loadQuestion mit optionalem Spawn-Delay
  const loadQuestion=(idx?:number, delaySeconds:number=0)=>{
    if(idx==null||idx>=blocks.length) idx=pickNextQuestionIndex();
    currentQuestionIndexRef.current=idx;
    questionSolvedRef.current=false;
    const q=blocks[idx];
    setQuestionText((q as unknown as { question?: string; prompt?: string; title?: string }).question || (q as unknown as { prompt?: string }).prompt || (q as unknown as { title?: string }).title || '');
    let sourceUnknown = (q as unknown as { answers?: unknown; options?: unknown; choices?: unknown; alternatives?: unknown; antworten?: unknown }).answers
      || (q as unknown as { options?: unknown }).options
      || (q as unknown as { choices?: unknown }).choices
      || (q as unknown as { alternatives?: unknown }).alternatives
      || (q as unknown as { antworten?: unknown }).antworten
      || [];
    if((!Array.isArray(sourceUnknown) || !sourceUnknown.length)){
  const cand = Object.values(q as unknown as Record<string, unknown>).find((v)=> Array.isArray(v) && v.length>0 && v.every((e)=> typeof e==='string' || typeof e==='object'));
      if(cand) sourceUnknown = cand as unknown[];
    }
    const rawAnswers = (Array.isArray(sourceUnknown)? sourceUnknown: []).map((a)=>{
      if(a==null) return { text:'', correct:false };
      if(typeof a==='string') return { text:a, correct:false };
      const obj = a as Record<string, unknown>;
      const text = (obj.text || obj.answer || obj.value || obj.label || obj.title || obj.content || '') as string;
      const correct = Boolean(obj.correct || obj.isCorrect || obj.right || obj.valid);
      return { text:String(text), correct };
    }).filter(a=> a.text !== '' || a.correct);
    // Falls keine Answer selbst als correct markiert ist, aber Block einen Index enthält -> anwenden
    let useAnswers = rawAnswers.length? rawAnswers : [{ text:'(keine Antworten gefunden)', correct:false }];
    if(useAnswers.length && !useAnswers.some(a=>a.correct)){
      const qAny = q as unknown as { correct?: unknown; correctIndex?: unknown };
      const idxFlag = (typeof qAny.correct === 'number')? qAny.correct : (typeof qAny.correctIndex === 'number'? qAny.correctIndex : undefined);
      if(typeof idxFlag === 'number' && idxFlag>=0 && idxFlag < useAnswers.length){
        useAnswers = useAnswers.map((a,i)=> i===idxFlag? {...a, correct:true}: a);
      }
    }
    // Shuffle Antworten (Fisher-Yates) für zufällige Platzierung
    const shuffled = [...useAnswers];
    for(let i=shuffled.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
    }
    spawnEntriesRef.current = shuffled.map((a,i)=>({ color:pickColorForIndex(i), correct:a.correct, laneIndex:i, nextSpawn: gameTimeRef.current + delaySeconds }));
    setCurrentAnswers(shuffled.map((a,i)=> ({...a, color: pickColorForIndex(i)})));
  };
  const start=()=>{ if(!blocks.length) return; setRunning(true); setPaused(false); setGameOver(false); setFinished(false); setScore(0); setLives(MAX_LIVES); wrongFlashRef.current=0; correctFlashRef.current=0; shakeRef.current=0; projectilesRef.current=[]; orbsRef.current=[]; particlesRef.current=[]; baseOrbSpeedRef.current=70; gameTimeRef.current=0; shootCooldownRef.current=0; if(!questionPoolRef.current.length) initQuestionPool(); loadQuestion(0,0); };
  const restart=()=> start();
  useEffect(()=>{ if(blocks.length){ if(!questionPoolRef.current.length) initQuestionPool(); loadQuestion(0,0);} },[blocks.length]);

  const trySpawnEntries=()=>{ const entries=spawnEntriesRef.current; if(!entries.length) return; const q=blocks[currentQuestionIndexRef.current]; const lines=(q.answers||(q as any).options||[]).length||4; const spacing=H/(lines+1); entries.forEach(entry=>{ const has=orbsRef.current.some(o=>o.spawnEntry===entry); if(!has && gameTimeRef.current>=entry.nextSpawn){ const y=spacing*(entry.laneIndex+1)+(Math.random()*30-15); const orb:Orb={x:W+40+Math.random()*80,y,r:22,color:entry.color,correct:entry.correct,speed:baseOrbSpeedRef.current+Math.random()*30,spawnEntry:entry}; orbsRef.current.push(orb);} }); };
  const shoot=()=>{ projectilesRef.current.push({x:shipRef.current.x+shipRef.current.r+4,y:shipRef.current.y,vx:520,r:6}); };
  const spawnParticles=(x:number,y:number,opts:{count?:number;spread?:number;speedMin?:number;speedMax?:number;color?:string;life?:number;size?:number}={})=>{ const {count=14,spread=Math.PI*2,speedMin=60,speedMax=260,color='#fff',life=0.6,size=5}=opts; for(let i=0;i<count;i++){ const ang=Math.random()*spread; const spd=speedMin+Math.random()*(speedMax-speedMin); particlesRef.current.push({x,y,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,life,maxLife:life,color,size:size*(0.6+Math.random()*0.5)}); } };
  const endGame=()=> setGameOver(true);
  const circleIntersect=(a:{x:number;y:number;r:number},b:{x:number;y:number;r:number})=>{ const dx=a.x-b.x; const dy=a.y-b.y; const rr=a.r+b.r; return dx*dx+dy*dy<=rr*rr; };

  // Game Loop (adapted from Impact template, retains green flash + delayed spawn after correct answer)
  useEffect(()=>{
    const canvas=canvasRef.current; if(!canvas) return; const ctx=canvas.getContext('2d'); if(!ctx) return; let frame:number;
    const update=(dt:number)=>{ if(!running||paused||gameOver) return; gameTimeRef.current+=dt; const ship=shipRef.current; // movement
      if(inputRef.current.up) ship.y-=ship.speed*dt; if(inputRef.current.down) ship.y+=ship.speed*dt; ship.y=Math.max(ship.r,Math.min(H-ship.r,ship.y));
      // shooting
      if(shootCooldownRef.current>0) shootCooldownRef.current-=dt; if(inputRef.current.shoot && shootCooldownRef.current<=0){ shoot(); shootCooldownRef.current=0.25; }
      // spawning
      trySpawnEntries();
      // move orbs
      orbsRef.current.forEach(o=>{ o.x-=o.speed*dt; if(o.x+o.r<=0){ if(spawnEntriesRef.current.includes(o.spawnEntry)) o.spawnEntry.nextSpawn=gameTimeRef.current+1; o._remove=true; }}); orbsRef.current=orbsRef.current.filter(o=>!o._remove);
      // projectiles
      projectilesRef.current.forEach(p=> p.x+=p.vx*dt); projectilesRef.current=projectilesRef.current.filter(p=> p.x-p.r<W && !p._hit);
      // particles
      particlesRef.current.forEach(pt=>{ pt.x+=pt.vx*dt; pt.y+=pt.vy*dt; pt.life-=dt; pt.vx*=(1-1.5*dt); pt.vy*=(1-1.5*dt); pt.vy+=40*dt*0.3; }); particlesRef.current=particlesRef.current.filter(p=>p.life>0);
      // projectile/orb collisions
  projectilesRef.current.forEach(p=>{ orbsRef.current.forEach(o=>{ if(circleIntersect(p,o)){ p._hit=true; o._hit=true; if(o.correct){
        // Richtige Kugel getroffen: Runde gelöst
        questionSolvedRef.current = true;
        setScore(s=>{ const ns=s+1; if(ns>=targetScore) setFinished(true); return ns; });
        decreaseWeight(currentQuestionIndexRef.current,0.6);
        spawnParticles(o.x,o.y,{color:'#4ade80',count:24,speedMin:110,speedMax:360,life:0.85,size:6});
        // Alle anderen Kugeln sofort explodieren lassen und entfernen
        orbsRef.current.forEach(rem=>{ if(rem!==o){
          spawnParticles(rem.x,rem.y,{color:'#bbbbbb',count:14,speedMin:70,speedMax:220,life:0.5,size:5});
          rem._hit = true;
        }});
        const nextIdx=pickNextQuestionIndex();
        // Nächste Frage sofort laden, neue Spawns leicht verzögert
        loadQuestion(nextIdx,1.0);
        wrongFlashRef.current=0; correctFlashRef.current=1; shakeRef.current=0;
      } else {
        // Falsche Kugel: nur bestrafen, wenn die richtige in dieser Runde noch nicht getroffen wurde
        if(!questionSolvedRef.current){
          setScore(s=>Math.max(0,s-1));
          setLives(l=>{ const nl=Math.max(0,l-1); if(nl<=0) endGame(); return nl; });
          increaseWeight(currentQuestionIndexRef.current,4);
          spawnParticles(o.x,o.y,{color:'#ff4444',count:14,speedMin:70,speedMax:260,life:0.55,size:5});
          wrongFlashRef.current=1; correctFlashRef.current=0; shakeRef.current=0.4;
        }
      } } }); });
      projectilesRef.current=projectilesRef.current.filter(p=>!p._hit); orbsRef.current=orbsRef.current.filter(o=>!o._hit);
  // ship collision with wrong orb (nur bestrafen, wenn noch nicht gelöst)
  orbsRef.current.forEach(o=>{ if(circleIntersect(ship,o) && !o.correct){ if(!questionSolvedRef.current){ setScore(s=>Math.max(0,s-1)); setLives(l=>{ const nl=Math.max(0,l-1); if(nl<=0) endGame(); return nl; }); spawnParticles(o.x,o.y,{color:'#ff4444',count:18,speedMin:70,speedMax:280,life:0.6,size:6}); wrongFlashRef.current=1; correctFlashRef.current=0; shakeRef.current=0.4; } o._remove=true; }}); orbsRef.current=orbsRef.current.filter(o=>!o._remove);
      // decay flashes/shake
      if(wrongFlashRef.current>0) wrongFlashRef.current=Math.max(0,wrongFlashRef.current-dt*2.5); if(correctFlashRef.current>0) correctFlashRef.current=Math.max(0,correctFlashRef.current-dt*1.3); if(shakeRef.current>0) shakeRef.current=Math.max(0,shakeRef.current-dt*2.5);
    };
    const drawBackground=(ctx:CanvasRenderingContext2D)=>{ ctx.fillStyle='#030712'; ctx.fillRect(0,0,W,H); ctx.fillStyle='#ffffff22'; for(let i=0;i<60;i++){ const x=(i*53%W); const y=(i*97%H); ctx.fillRect(x,y,2,2);} };
    const drawShip=(ctx:CanvasRenderingContext2D)=>{ const s=shipRef.current; ctx.save(); ctx.translate(s.x,s.y); ctx.fillStyle='#cbd5e1'; ctx.beginPath(); ctx.moveTo(-s.r*0.8,-s.r*0.6); ctx.lineTo(-s.r*0.8,s.r*0.6); ctx.lineTo(s.r,0); ctx.closePath(); ctx.fill(); ctx.restore(); };
    const drawProjectiles=(ctx:CanvasRenderingContext2D)=>{ ctx.fillStyle='#fff'; projectilesRef.current.forEach(p=>{ ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill(); }); };
    const drawOrbs=(ctx:CanvasRenderingContext2D)=>{ orbsRef.current.forEach(o=>{ ctx.beginPath(); let col=colorHex[o.color]||'#888'; if(o.color==='black') col='#555'; ctx.fillStyle=col; ctx.arc(o.x,o.y,o.r,0,Math.PI*2); ctx.fill(); }); };
    const drawParticles=(ctx:CanvasRenderingContext2D)=>{ particlesRef.current.forEach(pt=>{ const alpha=Math.max(pt.life/pt.maxLife,0); ctx.globalAlpha=alpha; ctx.fillStyle=pt.color; ctx.beginPath(); ctx.arc(pt.x,pt.y,pt.size*alpha,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1; }); };
    const render=()=>{ const ctx2=canvas.getContext('2d'); if(!ctx2) return; ctx2.clearRect(0,0,W,H); ctx2.save(); if(shakeRef.current>0){ const mag=12*shakeRef.current; ctx2.translate((Math.random()-0.5)*mag,(Math.random()-0.5)*mag);} drawBackground(ctx2); drawShip(ctx2); drawProjectiles(ctx2); drawOrbs(ctx2); drawParticles(ctx2); ctx2.restore(); if(wrongFlashRef.current>0){ ctx2.fillStyle=`rgba(255,0,0,${0.35*wrongFlashRef.current})`; ctx2.fillRect(0,0,W,H);} if(correctFlashRef.current>0){ ctx2.fillStyle=`rgba(0,255,140,${0.4*correctFlashRef.current})`; ctx2.fillRect(0,0,W,H);} if(paused && !gameOver){ ctx2.fillStyle='rgba(0,0,0,0.45)'; ctx2.fillRect(0,0,W,H); ctx2.fillStyle='#fff'; ctx2.font='48px system-ui'; ctx2.textAlign='center'; ctx2.fillText('PAUSE',W/2,H/2);} if(gameOver){ ctx2.fillStyle='rgba(0,0,0,0.55)'; ctx2.fillRect(0,0,W,H); ctx2.fillStyle='#fff'; ctx2.textAlign='center'; ctx2.font='46px system-ui'; ctx2.fillText('Game Over',W/2,H/2-20); ctx2.font='24px system-ui'; ctx2.fillText('Punkte: '+score,W/2,H/2+20);} };
    const loop=(ts:number)=>{ const last=lastTimeRef.current||ts; const dt=Math.min(0.033,(ts-last)/1000); lastTimeRef.current=ts; update(dt); render(); frame=requestAnimationFrame(loop); };
    frame=requestAnimationFrame(loop); return ()=> cancelAnimationFrame(frame);
  },[running,paused,gameOver,targetScore,questionText,currentAnswers,score,lives]);

  useEffect(()=>{ if(!finished && score>=targetScore){ setFinished(true); if(!completedLessons.includes(lesson._id)){ (async()=>{ try{ if(!session?.user?.username) return; setMarking(true); await finalizeLesson({ username:session.user.username, lessonId:lesson._id, courseId, type:lesson.type, earnedStar:lesson.type!=='markdown'}); setCompletedLessons(prev=> prev.includes(lesson._id)? prev:[...prev,lesson._id]); } finally { setMarking(false);} })(); } } },[score,targetScore,finished,completedLessons,lesson._id,lesson.type,courseId,session?.user?.username,setCompletedLessons]);

  useEffect(()=>{
    function apply(){
      const canvas=canvasRef.current; if(!canvas) return;
      const ratio=W/H;
  const HEIGHT_SCALE=1; // Keine Reduktion mehr
      if(isFullscreen){
        // Vollbild: maximale Größe ohne Scroll, orientiert an verfügbarer Höhe (kein Höhen-Scale)
        const vw=window.innerWidth; const vh=window.innerHeight;
        const hudH = hudRef.current? hudRef.current.getBoundingClientRect().height:0;
        const footerH = bottomInfoRef.current? bottomInfoRef.current.getBoundingClientRect().height:0;
        const margin=8;
        const availH = Math.max(120, vh - hudH - footerH - margin);
        let targetH = availH; // volle verfügbare Höhe
        let targetW = targetH * ratio;
        if(targetW > vw){ targetW = vw; targetH = targetW/ratio; }
  const w=Math.round(targetW); const h=Math.round(targetH);
  canvas.style.width=w+'px';
  canvas.style.height=h+'px';
  (canvas.style as any).aspectRatio='';
  setGamePixelWidth(w);
      } else {
        // Normalmodus: gleiche Logik wie Vollbild (maximale Höhe ohne Scroll) unter Berücksichtigung Containerbreite
        const vw=window.innerWidth; const vh=window.innerHeight;
        const hudH = hudRef.current? hudRef.current.getBoundingClientRect().height:0;
        const footerH = bottomInfoRef.current? bottomInfoRef.current.getBoundingClientRect().height:0;
        const margin=16; // etwas mehr Puffer im Normalmodus
        const availH = Math.max(160, vh - hudH - footerH - margin);
        const containerW = wrapperRef.current? wrapperRef.current.getBoundingClientRect().width : vw;
        let targetH = availH;
        let targetW = targetH * ratio;
        if(targetW > containerW){ targetW = containerW; targetH = targetW/ratio; }
        // Mindestgrößen
        if(targetW < 480){ targetW = 480; targetH = targetW/ratio; }
  const w=Math.round(targetW); const h=Math.round(targetH);
  canvas.style.width=w+'px';
  canvas.style.height=h+'px';
  (canvas.style as any).aspectRatio='';
  setGamePixelWidth(w);
      }
    }
    apply();
    window.addEventListener('resize',apply);
    const ro1=new ResizeObserver(apply); if(hudRef.current) ro1.observe(hudRef.current);
    const ro2=new ResizeObserver(apply); if(bottomInfoRef.current) ro2.observe(bottomInfoRef.current);
    return ()=>{ window.removeEventListener('resize',apply); ro1.disconnect(); ro2.disconnect(); };
  },[isFullscreen,questionText,currentAnswers.length]);

  const contentScaleRaw=Number((lesson.content as LessonContent | undefined)?.spaceScale);
  const DISPLAY_SCALE=(!isNaN(contentScaleRaw) && contentScaleRaw > 0.15 && contentScaleRaw <= 1) ? contentScaleRaw : 0.8;
  const BASE_WIDTH=Math.round(W*DISPLAY_SCALE);

  return (
  <div ref={wrapperRef} className={isFullscreen? 'w-screen h-screen flex flex-col items-center bg-[#05070d] overflow-hidden':'w-full flex flex-col items-center gap-2 bg-transparent overflow-hidden'}>
      {/* HUD */}
  <div ref={hudRef} className="w-full" style={{width: gamePixelWidth? gamePixelWidth: '100%', maxWidth: gamePixelWidth? gamePixelWidth: undefined}}>
        <div className="grid w-full select-none" style={{gridTemplateColumns:'1fr auto',gridTemplateAreas:'"frage status" "antworten antworten"',gap: isFullscreen?10:8,background:'#101826',border:'2px solid #2c3e50',borderRadius:10,padding: isFullscreen? '10px 14px':'10px 14px',boxShadow:'0 2px 6px -2px rgba(0,0,0,0.6)'}}>
          <div style={{gridArea:'frage'}} className={isFullscreen? 'text-[1.15rem] font-semibold text-white leading-snug whitespace-pre-wrap pr-3 min-h-[2.2rem]':'text-[1.05rem] font-semibold text-white leading-snug whitespace-pre-wrap pr-2 min-h-[2.2rem]'}>{questionText || '—'}</div>
          <div style={{gridArea:'status'}} className={`flex items-start gap-3 justify-end flex-wrap text-white font-semibold ${isFullscreen? 'text-[0.85rem]':'text-[0.72rem]'}`}>
            <span>Punkte: <span className="font-bold">{score}</span>/<span className="opacity-80">{targetScore}</span></span>
            <span className="flex items-center gap-1">Leben: {Array.from({length:MAX_LIVES}).map((_,i)=>(<span key={i} className={i<lives? 'text-red-400':'text-gray-600'}>❤</span>))}</span>
            <button onClick={()=> setPaused(p=>!p)} className={`rounded border font-semibold tracking-wide transition ${isFullscreen? 'px-5 py-2 text-[0.9rem]':'px-3 py-1 text-[0.65rem]'} ${paused? 'bg-lime-400 text-[#102] border-lime-500':'bg-[#2d3d55] text-white border-[#456282] hover:bg-[#38506e]'}`}>{paused? 'Weiter':'Pause'}</button>
            <button onClick={toggleFullscreen} className={`rounded border font-semibold tracking-wide bg-[#2d3d55] text-white border-[#456282] hover:bg-[#38506e] ${isFullscreen? 'px-5 py-2 text-[0.9rem]':'px-3 py-1 text-[0.65rem]'}`}>{isFullscreen? 'Zurück':'Vollbild'}</button>
          </div>
          <div style={{gridArea:'antworten'}} className={isFullscreen? 'grid grid-cols-2 gap-3 w-full':'flex flex-col gap-2 w-full'}>
            {currentAnswers.map((a,i)=>{ const colMap:Record<string,string>={red:'#e53935',blue:'#1e88e5',green:'#43a047',yellow:'#fdd835'}; const fg=a.color==='yellow'? '#212':'#fff'; const baseSize=isFullscreen? 'text-[1.25rem]' : 'text-[0.85rem]'; const padY=isFullscreen? 'py-4':'py-3'; return (
              <div key={i} className={`${baseSize} font-semibold rounded-md relative overflow-hidden flex items-center justify-center px-3 ${padY}`} style={{ background:colMap[a.color]||'#555', color:fg, minHeight: isFullscreen?90:50, boxShadow:'inset 0 0 0 2px rgba(255,255,255,0.18)' }}>
                <span className="w-full px-1 break-words leading-snug" style={{wordBreak:'break-word',overflowWrap:'anywhere',textShadow:'0 1px 2px rgba(0,0,0,0.55)',letterSpacing:'0.2px'}}>{a.text}</span>
              </div>
            ); })}
          </div>
        </div>
      </div>
      {/* Spielfeld */}
  <div className="relative w-full flex-1 flex items-center justify-center" style={{width: gamePixelWidth? gamePixelWidth: '100%'}}>
  <canvas ref={canvasRef} width={W} height={H} className={isFullscreen? 'block mx-auto rounded border-2 border-[#2c3e50] bg-black':'block mx-auto rounded-[10px] border-2 border-[#2c3e50] shadow bg-black'} style={!isFullscreen? {width:'100%',aspectRatio:`${W}/${H}`}:{maxWidth:'100%',maxHeight:'100%',objectFit:'contain'}} />
        {!running && !gameOver && !finished && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white gap-4 p-4 text-center">
            <h2 className="text-2xl font-bold">🛸 Space Impact</h2>
            <p className="text-xs max-w-xs">Steuere mit ↑ / ↓. Leertaste schießt. Triff die richtige Antwort-Kugel.</p>
            <button onClick={start} className="px-6 py-2 rounded bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold">Start (Enter)</button>
            <p className="text-[10px] opacity-70">Ziel: {targetScore} Punkte</p>
          </div>
        )}
        {paused && !gameOver && !finished && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-white text-4xl font-bold">PAUSE</div>
        )}
        {gameOver && !finished && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white gap-3 p-4 text-center">
            <div className="text-red-400 font-bold text-3xl">Game Over</div>
            <div className="text-sm">Punkte: {score}</div>
            <button onClick={restart} className="px-5 py-2 rounded bg-red-500 hover:bg-red-600 text-white text-sm font-semibold">Neu starten</button>
          </div>
        )}
        {finished && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white gap-3 p-4 text-center">
            <div className="text-green-400 font-bold text-3xl">✔ Ziel erreicht</div>
            <div className="text-sm">Punkte: {score}</div>
            <button onClick={restart} className="px-5 py-2 rounded bg-green-500 hover:bg-green-600 text-white text-sm font-semibold">Nochmal</button>
          </div>
        )}
        {marking && (<div className="absolute bottom-2 left-2 text-[11px] px-2 py-1 rounded bg-white/70 text-gray-700">Speichere Abschluss…</div>)}
      </div>
  <div ref={bottomInfoRef} className="text-[0.6rem] opacity-60 text-center text-white mt-1 pb-1">Pfeile / W-S bewegen • Space schießen • Pause: Button oder P • Ziel: richtige Farbe treffen!</div>
    </div>
  );
}
