"use client";
import React, { useRef, useState, useEffect } from 'react';
import type { Lesson } from '../types';
import { useSession } from 'next-auth/react';
import { finalizeLesson } from '../../../lib/lessonCompletion';
import { buildQuestionBlocks } from '../plane/questions';

/* DeepImpactGame: Variante analog SpaceImpact, aber eigenständiger Name ("Impact").
   Layout-Anforderungen:
   - HUD wie Vorlage: Frage + Antworten + Status (Punkte/Leben/Pause) sichtbar, auch im Vollbild.
   - Fragen & Antworten kommen aus DB (buildQuestionBlocks)
   - Zielscore wie andere Spiele (lesson.content.targetScore oder Default 15)
*/

interface Props { lesson: Lesson; courseId: string; completedLessons: string[]; setCompletedLessons: (v: string[] | ((p:string[])=>string[]))=>void; }

const W=960; const H=540; const FORCE_MIN_DPR=2; const MAX_LIVES=3; const DEFAULT_TARGET=15;

interface Orb { x:number;y:number;r:number;color:string;correct:boolean;speed:number;spawnEntry:any;_hit?:boolean;_remove?:boolean; }
interface Projectile { x:number;y:number;vx:number;r:number;_hit?:boolean; }
interface Particle { x:number;y:number;vx:number;vy:number;life:number;maxLife:number;color:string;size:number; }
interface SpawnEntry { color:string; correct:boolean; laneIndex:number; nextSpawn:number; }

export default function DeepImpactGame({ lesson, courseId, completedLessons, setCompletedLessons }:Props){
  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  const wrapperRef = useRef<HTMLDivElement|null>(null);
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

  const blocks = buildQuestionBlocks(lesson);
  const targetScore = Number((lesson as any)?.content?.targetScore) || DEFAULT_TARGET;

  const questionPoolRef = useRef<{idx:number;weight:number}[]>([]);
  const currentQuestionIndexRef = useRef(0);
  const spawnEntriesRef = useRef<SpawnEntry[]>([]);

  const initQuestionPool=()=>{ questionPoolRef.current = blocks.map((b,i)=>({idx:i,weight:5})); };
  const pickNextQuestionIndex=()=>{ if(!questionPoolRef.current.length) initQuestionPool(); const total=questionPoolRef.current.reduce((s,q)=>s+q.weight,0); let r=Math.random()*total; for(const q of questionPoolRef.current){ if(r<q.weight) return q.idx; r-=q.weight;} return questionPoolRef.current[0].idx; };
  const increaseWeight=(idx:number,amount:number)=>{ const e=questionPoolRef.current.find(q=>q.idx===idx); if(e) e.weight=Math.min(e.weight+amount,60); };
  const decreaseWeight=(idx:number,factor:number)=>{ const e=questionPoolRef.current.find(q=>q.idx===idx); if(e) e.weight=Math.max(e.weight*factor,1); };

  const pickColor = (i:number)=> ['red','blue','green','yellow'][i%4];

  const loadQuestion = (idx?:number)=>{
    if(idx==null || idx>=blocks.length) idx = pickNextQuestionIndex();
    currentQuestionIndexRef.current = idx;
    const q = blocks[idx];
    setQuestionText(q.question || (q as any).prompt || '');
    const raws = (q.answers || (q as any).options || []).map((a:any)=>({text:a.text||a.answer||a.value||'', correct:!!a.correct}));
    spawnEntriesRef.current = raws.map((a,i)=>({ color:pickColor(i), correct:a.correct, laneIndex:i, nextSpawn:0 }));
    setCurrentAnswers(raws.map((a,i)=>({...a,color:pickColor(i)})));
  };

  // Entities
  const shipRef = useRef({ x:70,y:H/2,r:22,speed:320 });
  const projectilesRef = useRef<Projectile[]>([]);
  const orbsRef = useRef<Orb[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const gameTimeRef = useRef(0); const shootCdRef = useRef(0);
  const inputRef = useRef({up:false,down:false,shoot:false});
  const lastTimeRef = useRef(0); const wrongFlashRef = useRef(0); const shakeRef=useRef(0);

  // Fullscreen
  const toggleFullscreen=()=>{ const el=wrapperRef.current; if(!el) return; if(!document.fullscreenElement){ el.requestFullscreen?.(); } else { document.exitFullscreen?.(); } };
  useEffect(()=>{ const h=()=> setIsFullscreen(!!document.fullscreenElement); document.addEventListener('fullscreenchange',h); return ()=> document.removeEventListener('fullscreenchange',h); },[]);

  // Input
  useEffect(()=>{ const kd=(e:KeyboardEvent)=>{ if(e.code==='ArrowUp'||e.code==='KeyW'){ inputRef.current.up=true; e.preventDefault(); } if(e.code==='ArrowDown'||e.code==='KeyS'){ inputRef.current.down=true; e.preventDefault(); } if(e.code==='Space'){ inputRef.current.shoot=true; e.preventDefault(); } if(e.code==='KeyP'){ setPaused(p=>!p);} if(!running && e.code==='Enter'){ start(); } if(gameOver && e.code==='Enter'){ restart(); } }; const ku=(e:KeyboardEvent)=>{ if(e.code==='ArrowUp'||e.code==='KeyW') inputRef.current.up=false; if(e.code==='ArrowDown'||e.code==='KeyS') inputRef.current.down=false; if(e.code==='Space') inputRef.current.shoot=false; }; window.addEventListener('keydown',kd); window.addEventListener('keyup',ku); return ()=>{ window.removeEventListener('keydown',kd); window.removeEventListener('keyup',ku); }; },[running,gameOver]);

  // Canvas setup
  useEffect(()=>{ const c=canvasRef.current; if(!c) return; const ctx=c.getContext('2d'); if(!ctx) return; const dpr=Math.max(window.devicePixelRatio||1,FORCE_MIN_DPR); c.width=W*dpr; c.height=H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); },[]);

  const start=()=>{ if(!blocks.length) return; setRunning(true); setPaused(false); setGameOver(false); setFinished(false); setScore(0); setLives(MAX_LIVES); projectilesRef.current=[]; orbsRef.current=[]; particlesRef.current=[]; gameTimeRef.current=0; shootCdRef.current=0; wrongFlashRef.current=0; shakeRef.current=0; if(!questionPoolRef.current.length) initQuestionPool(); loadQuestion(0); };
  const restart=()=> start();
  useEffect(()=>{ if(blocks.length){ if(!questionPoolRef.current.length) initQuestionPool(); loadQuestion(0);} },[blocks.length]);

  // Spawn logic
  const trySpawn=()=>{ const entries=spawnEntriesRef.current; if(!entries.length) return; const q=blocks[currentQuestionIndexRef.current]; const lines=(q.answers|| (q as any).options || []).length || 4; const spacing=H/(lines+1); entries.forEach(entry=>{ const exists=orbsRef.current.some(o=>o.spawnEntry===entry); if(!exists && gameTimeRef.current>=entry.nextSpawn){ const y=spacing*(entry.laneIndex+1) + (Math.random()*30-15); orbsRef.current.push({ x:W+40+Math.random()*80,y,r:22,color:entry.color,correct:entry.correct,speed:70+Math.random()*30,spawnEntry:entry }); }}); };

  const shoot=()=>{ projectilesRef.current.push({ x:shipRef.current.x+shipRef.current.r+4, y:shipRef.current.y, vx:520, r:6 }); };

  const spawnParticles=(x:number,y:number,opts:{count?:number;spread?:number;speedMin?:number;speedMax?:number;color?:string;life?:number;size?:number}={})=>{ const {count=14,spread=Math.PI*2,speedMin=60,speedMax=260,color='#fff',life=0.6,size=5}=opts; for(let i=0;i<count;i++){ const ang=Math.random()*spread; const spd=speedMin+Math.random()*(speedMax-speedMin); particlesRef.current.push({ x,y,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,life,maxLife:life,color,size:size*(0.6+Math.random()*0.5)}); } };

  const endGame=()=> setGameOver(true);
  const circle=(a:{x:number;y:number;r:number},b:{x:number;y:number;r:number})=>{ const dx=a.x-b.x; const dy=a.y-b.y; const rr=a.r+b.r; return dx*dx+dy*dy <= rr*rr; };

  useEffect(()=>{ const c=canvasRef.current; if(!c) return; const ctx=c.getContext('2d'); if(!ctx) return; let frame:number; const update=(dt:number)=>{ if(!running || paused || gameOver) return; gameTimeRef.current+=dt; const ship=shipRef.current; if(inputRef.current.up) ship.y-=ship.speed*dt; if(inputRef.current.down) ship.y+=ship.speed*dt; ship.y=Math.max(ship.r,Math.min(H-ship.r,ship.y)); if(shootCdRef.current>0) shootCdRef.current-=dt; if(inputRef.current.shoot && shootCdRef.current<=0){ shoot(); shootCdRef.current=0.25; } trySpawn(); orbsRef.current.forEach(o=> o.x -= o.speed*dt); orbsRef.current.forEach(o=>{ if(o.x+o.r<=0){ if(spawnEntriesRef.current.includes(o.spawnEntry)) o.spawnEntry.nextSpawn = gameTimeRef.current + 1; o._remove=true; }}); orbsRef.current = orbsRef.current.filter(o=>!o._remove); projectilesRef.current.forEach(p=> p.x += p.vx*dt); projectilesRef.current = projectilesRef.current.filter(p=> p.x - p.r < W); particlesRef.current.forEach(pt=>{ pt.x+=pt.vx*dt; pt.y+=pt.vy*dt; pt.life-=dt; pt.vx*=(1-1.5*dt); pt.vy*=(1-1.5*dt); pt.vy += 40*dt*0.3; }); particlesRef.current = particlesRef.current.filter(pt=>pt.life>0); // collisions
    projectilesRef.current.forEach(p=>{ orbsRef.current.forEach(o=>{ if(circle(p,o)){ p._hit=true; o._hit=true; if(o.correct){ setScore(s=>{ const ns=s+1; if(ns>=targetScore) setFinished(true); return ns; }); decreaseWeight(currentQuestionIndexRef.current,0.6); spawnParticles(o.x,o.y,{color:'#4ade80',count:18,speedMin:90,speedMax:320,life:0.7,size:6}); orbsRef.current.forEach(rem=>{ if(rem!==o){ if(spawnEntriesRef.current.includes(rem.spawnEntry)) rem.spawnEntry.nextSpawn=0; rem._hit=true; }}); const nextIdx=pickNextQuestionIndex(); loadQuestion(nextIdx); wrongFlashRef.current=0; } else { setScore(s=> Math.max(0,s-1)); setLives(l=>{ const nl=Math.max(0,l-1); if(nl<=0) endGame(); return nl; }); increaseWeight(currentQuestionIndexRef.current,4); spawnParticles(o.x,o.y,{color:'#ff4444',count:12,speedMin:70,speedMax:250,life:0.55,size:5}); wrongFlashRef.current=1; shakeRef.current=0.4; } } }); }); projectilesRef.current = projectilesRef.current.filter(p=>!p._hit); orbsRef.current.forEach(o=>{ if(o._hit){ if(spawnEntriesRef.current.includes(o.spawnEntry)) o.spawnEntry.nextSpawn = gameTimeRef.current + 1; }}); orbsRef.current = orbsRef.current.filter(o=>!o._hit); orbsRef.current.forEach(o=>{ if(circle(ship,o)){ if(!o.correct){ setScore(s=> Math.max(0,s-1)); setLives(l=>{ const nl=Math.max(0,l-1); if(nl<=0) endGame(); return nl; }); spawnParticles(o.x,o.y,{color:'#ff4444',count:16,speedMin:60,speedMax:260,life:0.6,size:6}); if(spawnEntriesRef.current.includes(o.spawnEntry)) o.spawnEntry.nextSpawn = gameTimeRef.current + 1; o._remove=true; wrongFlashRef.current=1; shakeRef.current=0.4; } }}); orbsRef.current = orbsRef.current.filter(o=>!o._remove); if(wrongFlashRef.current>0) wrongFlashRef.current = Math.max(0, wrongFlashRef.current - dt*2.5); if(shakeRef.current>0) shakeRef.current = Math.max(0, shakeRef.current - dt*2.5); };
    const render=()=>{ ctx.clearRect(0,0,W,H); ctx.save(); if(shakeRef.current>0){ const mag=12*shakeRef.current; ctx.translate((Math.random()-0.5)*mag,(Math.random()-0.5)*mag);} drawBackground(ctx); drawShip(ctx); drawProjectiles(ctx); drawOrbs(ctx); drawParticles(ctx); drawQuestionHUD(ctx); ctx.restore(); if(wrongFlashRef.current>0){ ctx.fillStyle=`rgba(255,0,0,${0.35*wrongFlashRef.current})`; ctx.fillRect(0,0,W,H);} if(paused && !gameOver){ ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.fillRect(0,0,W,H); ctx.fillStyle='#fff'; ctx.font='48px system-ui'; ctx.textAlign='center'; ctx.fillText('PAUSE', W/2, H/2);} if(gameOver){ ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(0,0,W,H); ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.font='46px system-ui'; ctx.fillText('Game Over', W/2, H/2 - 20); ctx.font='24px system-ui'; ctx.fillText('Punkte: '+score, W/2, H/2 + 20);} };
    const loop=(ts:number)=>{ const last=lastTimeRef.current||ts; const dt=Math.min(0.033,(ts-last)/1000); lastTimeRef.current=ts; update(dt); render(); frame=requestAnimationFrame(loop); }; frame=requestAnimationFrame(loop); return ()=> cancelAnimationFrame(frame); },[running,paused,gameOver,targetScore,questionText,currentAnswers,score,lives]);

  const drawBackground=(ctx:CanvasRenderingContext2D)=>{ ctx.fillStyle='#030712'; ctx.fillRect(0,0,W,H); ctx.fillStyle='#ffffff22'; for(let i=0;i<60;i++){ const x=(i*53 % W); const y=(i*97 % H); ctx.fillRect(x,y,2,2);} };
  const drawShip=(ctx:CanvasRenderingContext2D)=>{ const s=shipRef.current; ctx.save(); ctx.translate(s.x,s.y); ctx.fillStyle='#cbd5e1'; ctx.beginPath(); ctx.moveTo(-s.r*0.8,-s.r*0.6); ctx.lineTo(-s.r*0.8,s.r*0.6); ctx.lineTo(s.r,0); ctx.closePath(); ctx.fill(); ctx.restore(); };
  const drawProjectiles=(ctx:CanvasRenderingContext2D)=>{ ctx.fillStyle='#fff'; projectilesRef.current.forEach(p=>{ ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill(); }); };
  const drawOrbs=(ctx:CanvasRenderingContext2D)=>{ const map:Record<string,string>={red:'#e53935',blue:'#1e88e5',green:'#43a047',yellow:'#fdd835',black:'#111'}; orbsRef.current.forEach(o=>{ ctx.beginPath(); ctx.fillStyle=map[o.color]||'#888'; ctx.arc(o.x,o.y,o.r,0,Math.PI*2); ctx.fill(); }); };
  const drawParticles=(ctx:CanvasRenderingContext2D)=>{ particlesRef.current.forEach(pt=>{ const a=Math.max(pt.life/pt.maxLife,0); ctx.globalAlpha=a; ctx.fillStyle=pt.color; ctx.beginPath(); ctx.arc(pt.x,pt.y,pt.size*a,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1; }); };

  const drawQuestionHUD=(ctx:CanvasRenderingContext2D)=>{ if(!questionText||!currentAnswers.length) return; const fs=isFullscreen; const marginX=fs?12:10; const y0=fs?8:4; const maxW=W-marginX*2; const padX=fs?20:12; const padTop=fs?14:6; const padBottom=fs?14:8; const gap=fs?14:8; const answerH=fs?78:46; const qFont=fs? '600 32px system-ui':'600 18px system-ui'; const aFont=fs? '600 22px system-ui':'600 14px system-ui'; ctx.save(); ctx.font=qFont; ctx.textBaseline='top'; const words=questionText.split(/\s+/); let lines:string[]=[]; let l=''; const maxQW=maxW-padX*2; words.forEach(w=>{ const t=l? l+' '+w:w; if(ctx.measureText(t).width>maxQW){ if(l) lines.push(l); l=w; } else l=t; }); if(l) lines.push(l); const maxQL=fs?3:2; if(lines.length>maxQL){ let cut=lines.slice(0,maxQL); let last=cut[cut.length-1]; while(ctx.measureText(last+'…').width>maxQW && last.length>2){ last=last.slice(0,last.length-2);} cut[cut.length-1]=last+'…'; lines=cut; } const lineH=fs?40:22; const qH=lines.length*lineH; const count=currentAnswers.length; const innerAvail=maxW-padX*2-gap*(count-1); const boxW=Math.max(120,Math.floor(innerAvail/count)); const panelH=padTop+qH+10+answerH+padBottom; const panelX=marginX; const r=fs?14:12; ctx.globalAlpha=fs?0.72:0.6; ctx.beginPath(); ctx.moveTo(panelX+r,y0); ctx.lineTo(panelX+maxW-r,y0); ctx.quadraticCurveTo(panelX+maxW,y0,panelX+maxW,y0+r); ctx.lineTo(panelX+maxW,y0+panelH-r); ctx.quadraticCurveTo(panelX+maxW,y0+panelH,panelX+maxW-r,y0+panelH); ctx.lineTo(panelX+r,y0+panelH); ctx.quadraticCurveTo(panelX,y0+panelH,panelX,y0+panelH-r); ctx.lineTo(panelX,y0+r); ctx.quadraticCurveTo(panelX,y0,panelX+r,y0); ctx.fillStyle='rgba(16,24,38,0.92)'; ctx.fill(); ctx.globalAlpha=1; ctx.strokeStyle='rgba(60,90,120,0.9)'; ctx.lineWidth=2; ctx.stroke(); ctx.fillStyle='#fff'; ctx.textAlign='left'; lines.forEach((ln,i)=> ctx.fillText(ln,panelX+padX,y0+padTop+i*lineH)); ctx.font=fs? '600 30px system-ui':'600 14px system-ui'; const status=`Punkte: ${score}   Leben: ${lives}`; ctx.fillText(status,panelX+maxW-padX-ctx.measureText(status).width,y0+(fs?4:6)); ctx.font=aFont; ctx.textBaseline='middle'; ctx.textAlign='center'; const aBaseY=y0+padTop+qH+(fs?18:14); currentAnswers.forEach((a,i)=>{ const bx=panelX+padX+i*(boxW+gap); const by=aBaseY; const colMap:Record<string,string>={red:'#e53935',blue:'#1e88e5',green:'#43a047',yellow:'#fdd835'}; const bg=colMap[a.color]||'#555'; const fg=a.color==='yellow' ? '#212':'#fff'; const br=fs?14:8; ctx.beginPath(); ctx.moveTo(bx+br,by); ctx.lineTo(bx+boxW-br,by); ctx.quadraticCurveTo(bx+boxW,by,bx+boxW,by+br); ctx.lineTo(bx+boxW,by+answerH-br); ctx.quadraticCurveTo(bx+boxW,by+answerH,bx+boxW-br,by+answerH); ctx.lineTo(bx+br,by+answerH); ctx.quadraticCurveTo(bx,by+answerH,bx,by+answerH-br); ctx.lineTo(bx,by+br); ctx.quadraticCurveTo(bx,by,bx+br,by); ctx.fillStyle=bg; ctx.fill(); ctx.strokeStyle='rgba(255,255,255,0.35)'; ctx.lineWidth=1; ctx.stroke(); const maxTW=boxW-(fs?28:14); const wds=a.text.split(/\s+/); let alines:string[]=[]; let cur=''; wds.forEach(wd=>{ const t=cur? cur+' '+wd:wd; if(ctx.measureText(t).width>maxTW){ if(cur) alines.push(cur); cur=wd; } else cur=t; }); if(cur) alines.push(cur); const maxAL=fs?3:2; if(alines.length>maxAL){ let cut=alines.slice(0,maxAL); let last=cut[cut.length-1]; while(ctx.measureText(last+'…').width>maxTW && last.length>2){ last=last.slice(0,last.length-2);} cut[cut.length-1]=last+'…'; alines=cut; } const lh=fs?28:16; const total=alines.length*lh; let ty=by+(answerH-total)/2+lh/2-1; ctx.fillStyle=fg; alines.forEach(tl=>{ ctx.fillText(tl,bx+boxW/2,ty); ty+=lh; }); }); ctx.restore(); };

  // Abschluss
  useEffect(()=>{ if(!finished && score>=targetScore){ setFinished(true); if(!completedLessons.includes(lesson._id)){ (async()=>{ try{ const username=session?.user?.username; setMarking(true); await finalizeLesson({ username, lessonId:lesson._id, courseId, type:lesson.type, earnedStar:lesson.type!=='markdown'}); setCompletedLessons(prev=> prev.includes(lesson._id)? prev:[...prev, lesson._id]); } finally { setMarking(false);} })(); } } },[score,targetScore,finished,completedLessons,lesson._id,lesson.type,courseId,session?.user?.username,setCompletedLessons]);

  // Fullscreen Sizing
  useEffect(()=>{ function apply(){ const c=canvasRef.current; if(!c) return; if(isFullscreen){ const vw=window.innerWidth; const vh=window.innerHeight; const ratio=W/H; let w=vw; let h=w/ratio; if(h>vh){ h=vh; w=h*ratio;} c.style.width=w+'px'; c.style.height=h+'px'; } else { c.style.width='100%'; c.style.height=(100*(H/W))+'%'; } } apply(); if(isFullscreen){ window.addEventListener('resize',apply); return ()=> window.removeEventListener('resize',apply);} },[isFullscreen]);

  return (
    <div ref={wrapperRef} className={isFullscreen? 'w-screen h-screen flex flex-col items-center bg-[#05070d] overflow-hidden':'w-full flex flex-col items-center gap-2 bg-transparent'}>
      <div className="relative w-full" style={!isFullscreen? {maxWidth:W}:{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <canvas ref={canvasRef} width={W} height={H} className={isFullscreen? 'block mx-auto rounded border-2 border-[#2c3e50] bg-black':'block mx-auto rounded border-2 border-[#2c3e50] shadow bg-black'} style={!isFullscreen? {width:'100%',aspectRatio:`${W}/${H}`} : {maxWidth:'100%',maxHeight:'100%'}} />
        {!running && !gameOver && !finished && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white gap-4 p-4 text-center">
            <h2 className="text-2xl font-bold">☄️ Deep Impact</h2>
            <p className="text-xs max-w-xs">Steuere mit ↑ / ↓. Space schießt. Triff die richtige Antwort-Kugel.</p>
            <button onClick={start} className="px-6 py-2 rounded bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold">Start (Enter)</button>
            <p className="text-[10px] opacity-70">Ziel: {targetScore} Punkte</p>
            <div className="flex gap-3 text-[10px] opacity-80">
              <button onClick={()=> setPaused(p=>!p)} className={`px-2 py-1 rounded border text-[0.6rem] tracking-wide ${paused? 'bg-lime-400 text-[#102] border-lime-500':'bg-[#2d3d55] text-white border-[#456282] hover:bg-[#38506e]'}`}>{paused? 'Weiter':'Pause'}</button>
              <button onClick={toggleFullscreen} className="px-2 py-1 rounded border text-[0.6rem] tracking-wide bg-[#2d3d55] text-white border-[#456282] hover:bg-[#38506e]">{isFullscreen? 'Zurück':'Vollbild'}</button>
            </div>
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
        {marking && (
          <div className="absolute bottom-2 left-2 text-[11px] px-2 py-1 rounded bg-white/70 text-gray-700">Speichere Abschluss…</div>
        )}
      </div>
      <div className="text-[0.7rem] opacity-70 text-center text-white mt-1">Pfeile / W-S bewegen • Space schießen • P Pause • Richtige Farbe treffen!</div>
    </div>
  );
}
