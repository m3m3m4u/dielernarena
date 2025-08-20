"use client";
import React, { useEffect, useRef, useState } from 'react';
import type { Lesson } from '../types';
import { useSession } from 'next-auth/react';
import { finalizeLesson } from '../../../lib/lessonCompletion';
import { buildQuestionBlocks } from '../plane/questions';

interface Props { lesson: Lesson; courseId: string; completedLessons: string[]; setCompletedLessons: (v: string[] | ((p:string[])=>string[]))=>void; }

// Canvas Logik Konstanten – quadratisch ~500x500 laut Anforderung
const LOGICAL_W = 500; const LOGICAL_H = 500; // Square
// Anzeigegröße außerhalb Vollbild etwas größer darstellen
const NON_FS_CANVAS_PX = 560;
const LANES = 4; const ROAD_RATIO = 0.8; // Straße 400px breit bei 500 Canvas
const ROAD_WIDTH = LOGICAL_W * ROAD_RATIO; const LANE_WIDTH = ROAD_WIDTH / LANES; const LANE_START_X = (LOGICAL_W - ROAD_WIDTH) / 2; // zentriert
const MAX_LIVES = 3; const DEFAULT_TARGET_SCORE = 12;
// Auto-Ziel Y dynamisch: knapp über unterem Rand (10-12px Abstand)
const CAR_TARGET_Y = LOGICAL_H - ( ( (LOGICAL_W * 0.8) / 4) * 0.7 * 1.5 ) / 2 - 12; // LOGICAL_W*0.8 = ROAD_WIDTH
const CAR_SPEED_LERP = 0.2;
const OBSTACLE_HEIGHT = 74; 
// Basisgeschwindigkeit halbiert (vorher 300) für ~50% langsameres Spieltempo
const OBSTACLE_SPEED_BASE = 150; 
const OBSTACLE_WIDTH = LANE_WIDTH * 0.45; const MAX_ACTIVE_OBSTACLES = 2;

interface Obstacle { lane:number; y:number; answerIndex:number; isCorrect:boolean; hit:boolean; removed:boolean; alpha:number; color:string; }
interface Particle { x:number;y:number;vx:number;vy:number;life:number;age:number;r:number;color:string;spin:number; }

function laneCenter(l:number){ return LANE_START_X + l*LANE_WIDTH + LANE_WIDTH/2; }

const VERSION = '0.2';

export default function AutoGame({ lesson, courseId, completedLessons, setCompletedLessons }:Props){
  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  const containerRef = useRef<HTMLDivElement|null>(null); // Gesamtcontainer für Vollbild
  const rowRef = useRef<HTMLDivElement|null>(null); // Zeilen-Container außerhalb Vollbild
  const sidePanelRef = useRef<HTMLDivElement|null>(null);
  const { data: session } = useSession();

  // Game State
  const [running,setRunning] = useState(false);
  const [gameOver,setGameOver] = useState(false);
  const [finished,setFinished] = useState(false);
  const [score,setScore] = useState(0);
  const [lives,setLives] = useState(MAX_LIVES);
  const [questionText,setQuestionText] = useState('');
  const [answers,setAnswers] = useState<{text:string;correct:boolean;color:string}[]>([]);
  const [marking,setMarking] = useState(false);
  const [paused,setPaused] = useState(false);
  const [carReady,setCarReady] = useState(false);
  const [isFullscreen,setIsFullscreen] = useState(false);
  const [dynamicSize,setDynamicSize] = useState(LOGICAL_W); // tatsächliche Canvas CSS-Kante
  const [fsPanelWidth,setFsPanelWidth] = useState(320); // feste Panelbreite im Vollbild (stabil)
  const scaleRef = useRef(1); // aktuelle Zeichenskalierung relativ zu Logikgröße
  const carImgRef = useRef<HTMLImageElement|null>(null);
  // Touch/Swipe
  const touchStartRef = useRef<{x:number;y:number;time:number}|null>(null);

  // Dynamic lesson config
  const blocks = buildQuestionBlocks(lesson);
  const targetScore = Number((lesson as any)?.content?.targetScore)||DEFAULT_TARGET_SCORE;

  // Car state
  const START_LANE = 0; // Links starten (vorher 1) damit nicht auf einer Trennlinie wahrgenommen
  const carLaneRef = useRef(START_LANE); const desiredLaneRef = useRef(START_LANE); const carXRef = useRef(laneCenter(START_LANE)); const carYRef = useRef(CAR_TARGET_Y);
  const carPulseRef = useRef(0);
  // Obstacles & particles
  const obstaclesRef = useRef<Obstacle[]>([]);
  const laneCooldownRef = useRef<number[]>(new Array(LANES).fill(0));
  const particlesRef = useRef<Particle[]>([]);
  const answerRefs = useRef<(HTMLLIElement|null)[]>([]); // für Flash-Animationen

  // Question selection weights
  const questionPoolRef = useRef<{idx:number;weight:number}[]>([]);
  const currentQuestionIndexRef = useRef(0);

  const colorPalette = ['#1e90ff','#ffb300','#6ecb3c','#ff4d4d'];
  const initQuestionPool = ()=>{ questionPoolRef.current = blocks.map((_,i)=> ({ idx:i, weight:5 })); };
  const pickNextQuestionIndex = ()=>{ if(!questionPoolRef.current.length) initQuestionPool(); const total = questionPoolRef.current.reduce((s,q)=> s+q.weight,0); let r=Math.random()*total; for(const q of questionPoolRef.current){ if(r<q.weight) return q.idx; r-=q.weight; } return questionPoolRef.current[0].idx; };
  const increaseWeight=(idx:number,amount:number)=>{ const e=questionPoolRef.current.find(q=>q.idx===idx); if(e) e.weight=Math.min(e.weight+amount,60); };
  const decreaseWeight=(idx:number,factor:number)=>{ const e=questionPoolRef.current.find(q=>q.idx===idx); if(e) e.weight=Math.max(e.weight*factor,1); };

  const loadQuestion = (idx?:number)=>{
    if(idx==null || idx>=blocks.length) idx=pickNextQuestionIndex();
    currentQuestionIndexRef.current = idx;
    const q:any = blocks[idx];
    setQuestionText(q.question || q.prompt || q.title || '');
    let source:any[] = q.answers || q.options || q.choices || q.alternatives || q.antworten || [];
    if(!Array.isArray(source) || !source.length){
      const cand = Object.values(q).find((v:any)=> Array.isArray(v) && v.length && v.every((e:any)=> typeof e==='string' || typeof e==='object'));
      if(cand) source = cand as any[];
    }
    let rawAnswers = (Array.isArray(source)? source: []).map((a:any)=>{
      if(a==null) return { text:'', correct:false };
      if(typeof a==='string') return { text:a, correct:false };
      const text = a.text || a.answer || a.value || a.label || a.title || a.content || '';
      const correct = !!(a.correct || a.isCorrect || a.right || a.valid);
      return { text:String(text), correct };
    }).filter(a=> a.text!=='' || a.correct);
    if(rawAnswers.length && !rawAnswers.some(a=>a.correct)){
      const idxFlag = (typeof q.correct === 'number')? q.correct : (typeof q.correctIndex === 'number'? q.correctIndex : undefined);
      if(typeof idxFlag === 'number' && idxFlag>=0 && idxFlag<rawAnswers.length){ rawAnswers = rawAnswers.map((a,i)=> i===idxFlag? {...a, correct:true}: a); }
    }
    // shuffle
    for(let i=rawAnswers.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [rawAnswers[i],rawAnswers[j]]=[rawAnswers[j],rawAnswers[i]]; }
    const mapped = rawAnswers.slice(0,LANES).map((a,i)=> ({ text:a.text, correct:a.correct, color: colorPalette[i%colorPalette.length] }));
    setAnswers(mapped);
    setupInitialObstacles(mapped);
  };

  // Obstacle helpers
  function setupInitialObstacles(currentAnswers:{text:string;correct:boolean;color:string}[]){
    obstaclesRef.current = [];
    laneCooldownRef.current = new Array(LANES).fill(0);
    const correctLane = currentAnswers.findIndex(a=>a.correct);
    const lanes = [...Array(LANES).keys()].sort(()=> Math.random()-0.5);
    const baseCount = 2 + (Math.random()<0.5?1:0);
    for(let i=0;i<baseCount;i++){
      const l = lanes[i]; const y = - (OBSTACLE_HEIGHT + 80 + Math.random()*260);
      obstaclesRef.current.push(makeObstacle(l,y,currentAnswers));
    }
    if(correctLane>=0 && !obstaclesRef.current.some(o=>o.lane===correctLane)){
      obstaclesRef.current.push(makeObstacle(correctLane, - (OBSTACLE_HEIGHT + 120 + Math.random()*120), currentAnswers));
    }
  }
  function makeObstacle(lane:number,y:number,currentAnswers:{text:string;correct:boolean;color:string}[]):Obstacle{
    const ans = currentAnswers[lane];
    return { lane, y, answerIndex: lane, isCorrect: !!ans?.correct, hit:false, removed:false, alpha:1, color: ans? ans.color: '#888'};
  }
  function randomCooldown(){ return 0.8 + Math.random()*1.9; }

  // Input
  useEffect(()=>{
    const kd=(e:KeyboardEvent)=>{
      if(e.key==='ArrowLeft'){ desiredLaneRef.current = Math.max(0, desiredLaneRef.current-1);} 
      if(e.key==='ArrowRight'){ desiredLaneRef.current = Math.min(LANES-1, desiredLaneRef.current+1);} 
      if(!running && (e.key==='Enter'|| e.key===' ')){ start(); }
      if(!gameOver && running && e.key===' '){ setPaused(p=>!p);} 
      if(gameOver && (e.key==='Enter'|| e.key===' ')){ restart(); } 
      if(e.key==='f' || e.key==='F'){ toggleFullscreen(); }
      if(e.key==='Escape' && isFullscreen && document.fullscreenElement){ document.exitFullscreen().catch(()=>{}); }
    };
    window.addEventListener('keydown',kd);
    return ()=> window.removeEventListener('keydown',kd);
  },[running,gameOver,isFullscreen]);

  const start=()=>{ if(!blocks.length) return; setRunning(true); setPaused(false); setGameOver(false); setFinished(false); setScore(0); setLives(MAX_LIVES); carLaneRef.current=START_LANE; desiredLaneRef.current=START_LANE; carXRef.current=laneCenter(START_LANE); carPulseRef.current=0; obstaclesRef.current=[]; particlesRef.current=[]; if(!questionPoolRef.current.length) initQuestionPool(); loadQuestion(0); };
  const restart=()=> start();
  useEffect(()=>{ if(blocks.length){ if(!questionPoolRef.current.length) initQuestionPool(); loadQuestion(0);} },[blocks.length]);

  // Car image preload
  useEffect(()=>{
    const img = new Image();
    img.onload = ()=> { carImgRef.current = img; setCarReady(true); };
    img.onerror = ()=> { console.warn('AutoGame: /media/auto.png konnte nicht geladen werden'); };
    img.src = '/media/auto.png';
  },[]);

  // Vollbild / Resize Handling
  useEffect(()=>{
    function handleFsChange(){
      const fsEl = document.fullscreenElement;
      setIsFullscreen(!!fsEl && fsEl===containerRef.current);
    }
    document.addEventListener('fullscreenchange',handleFsChange);
    return ()=> document.removeEventListener('fullscreenchange',handleFsChange);
  },[]);

  // Body Scroll im Vollbild deaktivieren (verhindert Layout-Sprünge durch Scrollbar)
  useEffect(()=>{
    if(isFullscreen){
      const prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      return ()=> { document.documentElement.style.overflow = prevOverflow; };
    }
  },[isFullscreen]);

  useEffect(()=>{
    let resizeRaf:number|undefined; let lastW=window.innerWidth; let lastH=window.innerHeight;
    function calc(w:number,h:number){
      const padding=48, gapPx=32; const availW = w - fsPanelWidth - padding - gapPx; const availH = h - padding; const size=Math.min(availW,availH); setDynamicSize(prev=> Math.max(420, Math.min(size,1000))); }
  function fullRecalc(){ if(isFullscreen){ calc(window.innerWidth, window.innerHeight);} else { setDynamicSize(NON_FS_CANVAS_PX);} }
    function onResize(){ if(!isFullscreen) return; const w=window.innerWidth,h=window.innerHeight; if(Math.abs(w-lastW)>5|| Math.abs(h-lastH)>5){ lastW=w; lastH=h; if(resizeRaf) cancelAnimationFrame(resizeRaf); resizeRaf=requestAnimationFrame(fullRecalc);} }
    fullRecalc(); window.addEventListener('resize',onResize); return ()=>{ window.removeEventListener('resize',onResize); if(resizeRaf) cancelAnimationFrame(resizeRaf); };
  },[isFullscreen, fsPanelWidth]);

  // Nicht-Vollbild: Canvas dynamisch anhand verfügbarer Breite/Höhe im Row-Container anpassen
  useEffect(()=>{
    if(isFullscreen) return;
  const measure = ()=>{
      try{
        const row = rowRef.current; const panel = sidePanelRef.current; if(!row){ setDynamicSize(NON_FS_CANVAS_PX); return; }
        const rowW = row.clientWidth||0; const panelW = panel? panel.clientWidth: 0;
        const gapPx = (window.innerWidth >= 1024)? 24: 0;
    const availW = Math.max(320, rowW - panelW - gapPx);
    const rowRect = row.getBoundingClientRect();
    const bottomPadding = 24;
    const availH = Math.max(320, window.innerHeight - rowRect.top - bottomPadding);
        const target = Math.min(availW, availH);
    const clamped = Math.max(540, Math.min(target, 800));
        setDynamicSize(clamped);
      }catch{}
    };
    const ro = new ResizeObserver(()=>{ requestAnimationFrame(measure); });
    if(rowRef.current) ro.observe(rowRef.current);
    if(sidePanelRef.current) ro.observe(sidePanelRef.current);
    const onResize = ()=> requestAnimationFrame(measure);
    window.addEventListener('resize', onResize);
    // Initial call
    requestAnimationFrame(measure);
    return ()=>{ try{ ro.disconnect(); }catch{} window.removeEventListener('resize', onResize); };
  },[isFullscreen]);

  // Panelbreite im Vollbild nochmals ~30% breiter machen
  useEffect(()=>{ if(isFullscreen){ const vw=window.innerWidth; const fixed = Math.min(800, Math.max(480, Math.round(vw*0.44))); setFsPanelWidth(fixed); } },[isFullscreen]);

  // Canvas DPI + Scale an dynamicSize koppeln
  useEffect(()=>{
    const canvas = canvasRef.current; if(!canvas) return; const ctx = canvas.getContext('2d'); if(!ctx) return;
    const DPR = Math.max(1, window.devicePixelRatio||1);
    const scale = dynamicSize / LOGICAL_W;
    scaleRef.current = scale;
    // Physikalische Pixelgröße setzen (High DPI)
    canvas.width = Math.round(LOGICAL_W * scale * DPR);
    canvas.height = Math.round(LOGICAL_H * scale * DPR);
    canvas.style.width = dynamicSize + 'px';
    canvas.style.height = dynamicSize + 'px';
    ctx.setTransform(scale * DPR,0,0,scale * DPR,0,0);
    ctx.imageSmoothingEnabled = true; (ctx as any).imageSmoothingQuality='high';
  },[dynamicSize]);

  const toggleFullscreen = ()=>{
    const el = containerRef.current; if(!el) return;
    if(!document.fullscreenElement){ el.requestFullscreen().catch(()=>{}); }
    else if(document.fullscreenElement===el){ document.exitFullscreen().catch(()=>{}); }
  };

  // Game loop
  useEffect(()=>{
    const canvas = canvasRef.current; if(!canvas) return; const ctx = canvas.getContext('2d'); if(!ctx) return;
    // SetTransform wurde bereits im Skalierungs-Effect gesetzt – hier nur sicherstellen, dass Transform stimmt
    const DPR = Math.max(1, window.devicePixelRatio||1);
    const scale = scaleRef.current;
    ctx.setTransform(scale * DPR,0,0,scale * DPR,0,0);
    let last = performance.now(); let frame:number; let shakeTime=0; let shakeIntensity=0; let damageFlashTime=0; let successFlashTime=0; let pendingGameOver=false; let gameOverDelay=0;
    function spawnSuccessParticles(x:number,y:number,color:string){
      const count = 26;
      for(let i=0;i<count;i++){
        const a = Math.random()*Math.PI*2;
        const sp = 80 + Math.random()*260;
        particlesRef.current.push({ x,y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp - 60, life:0.7+Math.random()*0.5, age:0, r:16+Math.random()*18, color, spin:(Math.random()*8-4) });
      }
    }
    function flashAnswerRow(i:number, correct:boolean){
      const el = answerRefs.current[i]; if(!el) return;
      el.classList.remove('flash-correct','flash-wrong');
      // Reflow forcieren um Animation neu zu starten
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      (el as HTMLElement).offsetWidth;
      el.classList.add(correct? 'flash-correct':'flash-wrong');
    }

    function spawnNewForLane(lane:number){ if(laneCooldownRef.current[lane]>0) return; if(obstaclesRef.current.length>=MAX_ACTIVE_OBSTACLES) return; let topY=Infinity; for(const o of obstaclesRef.current) if(o.lane===lane && !o.removed) topY=Math.min(topY,o.y); if(topY===Infinity) topY=LOGICAL_H; const baseGap = 360 + Math.random()*400; const y = Math.min(-OBSTACLE_HEIGHT - 40 - Math.random()*120, topY - baseGap); obstaclesRef.current.push(makeObstacle(lane,y,answers)); laneCooldownRef.current[lane] = randomCooldown(); }

  function loop(ts:number){ const dt = Math.min(0.033,(ts-last)/1000); last=ts; if(running && !paused && !gameOver && !finished){ // update
        const targetX = laneCenter(desiredLaneRef.current); carXRef.current += (targetX - carXRef.current) * CAR_SPEED_LERP;
        // timers
        if(shakeTime>0){ shakeTime-=dt; if(shakeTime<0) shakeTime=0; }
        if(damageFlashTime>0){ damageFlashTime-=dt; if(damageFlashTime<0) damageFlashTime=0; }
        if(successFlashTime>0){ successFlashTime-=dt; if(successFlashTime<0) successFlashTime=0; }
        if(carPulseRef.current>0){ carPulseRef.current-=dt; if(carPulseRef.current<0) carPulseRef.current=0; }
        for(let l=0;l<LANES;l++) if(laneCooldownRef.current[l]>0) laneCooldownRef.current[l]-=dt;
        // obstacles
        obstaclesRef.current.forEach(o=>{ o.y += OBSTACLE_SPEED_BASE * dt; if(o.removed){ o.alpha -= dt*2.2; } });
        // collisions
        const carRect = { left:carXRef.current- (LANE_WIDTH*0.7)/2, right:carXRef.current+(LANE_WIDTH*0.7)/2, top:carYRef.current-100/2, bottom:carYRef.current+100/2 };
        for(const o of obstaclesRef.current){ if(o.removed) continue; const ox = laneCenter(o.lane) - OBSTACLE_WIDTH/2; const oy=o.y; const oRect = { left:ox, right:ox+OBSTACLE_WIDTH, top:oy, bottom:oy+OBSTACLE_HEIGHT }; if(!(carRect.right<oRect.left||carRect.left>oRect.right||carRect.bottom<oRect.top||carRect.top>oRect.bottom)){
            if(o.isCorrect && !o.hit){
              o.hit=true; o.removed=true; scoreUpdater(1,true);
              successFlashTime=0.35; carPulseRef.current=0.45;
              flashAnswerRow(o.answerIndex,true);
              spawnSuccessParticles(laneCenter(o.lane), o.y + OBSTACLE_HEIGHT/2, o.color);
              const nextIdx=pickNextQuestionIndex();
              loadQuestion(nextIdx);
            } else if(!o.hit){
              o.hit=true; livesUpdater(-1);
              flashAnswerRow(o.answerIndex,false);
              shakeTime=0.45; shakeIntensity=14; damageFlashTime=0.35;
              if(lives-1<=0 && !pendingGameOver){ pendingGameOver=true; gameOverDelay=0.55; }
            }
          }
        }
        // particles update
        particlesRef.current.forEach(p=>{ p.age+=dt; if(p.age>=p.life) return; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy += 220*dt; }); particlesRef.current = particlesRef.current.filter(p=> p.age<p.life);
        // remove / respawn obstacles
        for(let i=obstaclesRef.current.length-1;i>=0;i--){ const o=obstaclesRef.current[i]; if(o.removed && o.alpha<=0){ const lane=o.lane; obstaclesRef.current.splice(i,1); laneCooldownRef.current[lane]=randomCooldown(); continue; } if(o.y>LOGICAL_H+60){ const lane=o.lane; obstaclesRef.current.splice(i,1); laneCooldownRef.current[lane]=randomCooldown(); } }
        // ensure at least one correct obstacle active
        const correctLane = answers.findIndex(a=>a.correct);
        if(correctLane>=0 && !obstaclesRef.current.some(o=>o.isCorrect && !o.removed)) spawnNewForLane(correctLane);
        // spawn on other lanes
        const order=[0,1,2,3].sort(()=>Math.random()-0.5); for(const l of order){ if(obstaclesRef.current.length>=MAX_ACTIVE_OBSTACLES) break; const active = obstaclesRef.current.some(o=>o.lane===l); if(!active && laneCooldownRef.current[l]<=0) spawnNewForLane(l); }
        // pending game over
        if(pendingGameOver && !gameOver){ gameOverDelay-=dt; if(gameOverDelay<=0){ setGameOver(true); damageFlashTime=0; successFlashTime=0; shakeTime=0; shakeIntensity=0; } }
      }
      // render
  if(!ctx) return; // type guard
  ctx.clearRect(0,0,LOGICAL_W,LOGICAL_H);
      // shake
  if(!gameOver && shakeTime>0){ const f=shakeTime/0.45; const mag=shakeIntensity*f*f; ctx.save(); ctx.translate((Math.random()*2-1)*mag,(Math.random()*2-1)*mag); drawScene(ctx as CanvasRenderingContext2D); ctx.restore(); } else { drawScene(ctx as CanvasRenderingContext2D); }
  if(damageFlashTime>0 && !gameOver){ const a=(damageFlashTime/0.35)*0.55; ctx.fillStyle=`rgba(255,0,0,${a.toFixed(3)})`; ctx.fillRect(0,0,LOGICAL_W,LOGICAL_H); }
  if(successFlashTime>0){ const a=(successFlashTime/0.35)*0.45; ctx.fillStyle=`rgba(0,255,120,${a.toFixed(3)})`; ctx.fillRect(0,0,LOGICAL_W,LOGICAL_H); }
  if(gameOver){ ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(0,0,LOGICAL_W,LOGICAL_H); ctx.fillStyle='#fff'; ctx.font='48px system-ui'; ctx.textAlign='center'; ctx.fillText('Game Over',LOGICAL_W/2,LOGICAL_H/2); ctx.font='24px system-ui'; ctx.fillText('Enter / Button = Neustart',LOGICAL_W/2,LOGICAL_H/2+40); }
      frame=requestAnimationFrame(loop);
    }
  function drawScene(ctx:CanvasRenderingContext2D){ drawRoad(ctx); drawCar(ctx); drawObstacles(ctx); drawParticles(ctx); if(paused && running && !gameOver && !finished){ ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.fillRect(0,0,LOGICAL_W,LOGICAL_H); ctx.fillStyle='#fff'; ctx.font='40px system-ui'; ctx.textAlign='center'; ctx.fillText('PAUSE',LOGICAL_W/2,LOGICAL_H/2); ctx.font='18px system-ui'; ctx.fillText('Leertaste = weiter',LOGICAL_W/2,LOGICAL_H/2+34); } }
    function drawRoad(ctx:CanvasRenderingContext2D){
      // Gesamter Hintergrund (dunkler Rand links/rechts außerhalb der Straße)
      ctx.fillStyle = '#202325';
      ctx.fillRect(0,0,LOGICAL_W,LOGICAL_H);
      // Straße (zentriert 400px) mit leichtem Verlauf
      const roadGrad = ctx.createLinearGradient(LANE_START_X,0,LANE_START_X+ROAD_WIDTH,0);
      roadGrad.addColorStop(0,'#2d3134');
      roadGrad.addColorStop(0.5,'#353a3e');
      roadGrad.addColorStop(1,'#2d3134');
      ctx.fillStyle = roadGrad;
      ctx.fillRect(LANE_START_X,0,ROAD_WIDTH,LOGICAL_H);
      // Außenlinien direkt an der Straße
      ctx.strokeStyle = '#ffffff22';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(LANE_START_X+1.5,0); ctx.lineTo(LANE_START_X+1.5,LOGICAL_H);
      ctx.moveTo(LANE_START_X+ROAD_WIDTH-1.5,0); ctx.lineTo(LANE_START_X+ROAD_WIDTH-1.5,LOGICAL_H);
      ctx.stroke();
      // Lane Striche korrekt relativ zum Straßenstart
      ctx.strokeStyle='#ffffff66';
      ctx.lineWidth=2;
      ctx.setLineDash([16,22]);
      ctx.lineDashOffset = -(performance.now()/30);
      for(let l=1;l<LANES;l++){
        const x = LANE_START_X + l*LANE_WIDTH; // korrigierter Offset
        ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,LOGICAL_H); ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  function drawCar(ctx:CanvasRenderingContext2D){ const carWidth=LANE_WIDTH*0.7; const carHeight=carWidth*1.5; ctx.save(); ctx.translate(carXRef.current,carYRef.current); let lean=0; const dx = laneCenter(desiredLaneRef.current)-carXRef.current; lean=dx*0.0045; ctx.rotate(lean); let scale=1; if(carPulseRef.current>0){ const t=carPulseRef.current/0.45; scale=1+Math.sin((1-t)*Math.PI)*0.22*t; } ctx.scale(scale,scale); if(carReady && carImgRef.current){ ctx.imageSmoothingEnabled=true; (ctx as any).imageSmoothingQuality='high'; const targetW = carWidth; const targetH = carHeight; ctx.drawImage(carImgRef.current, -targetW/2, -targetH/2, targetW, targetH);} else { ctx.fillStyle='#c00'; ctx.beginPath(); ctx.roundRect(-carWidth/2,-carHeight/2,carWidth,carHeight,16); ctx.fill(); } ctx.restore(); }
    function drawObstacles(ctx:CanvasRenderingContext2D){ for(const o of obstaclesRef.current){ const x=laneCenter(o.lane)-OBSTACLE_WIDTH/2; const y=o.y; ctx.save(); ctx.globalAlpha=(o.removed? o.alpha : (o.hit?0.55:1)); ctx.fillStyle=o.color; ctx.strokeStyle='#00000055'; ctx.lineWidth=1.4; ctx.beginPath(); ctx.roundRect(x,y,OBSTACLE_WIDTH,OBSTACLE_HEIGHT,16); ctx.fill(); ctx.stroke(); ctx.restore(); } }
    function drawParticles(ctx:CanvasRenderingContext2D){ for(const p of particlesRef.current){ const k=1-(p.age/p.life); const alpha=k*k; const r=p.r*(0.4+0.6*k); ctx.save(); ctx.globalAlpha=alpha; ctx.fillStyle=p.color; ctx.translate(p.x,p.y); ctx.rotate(p.spin*p.age); ctx.beginPath(); ctx.moveTo(-r,0); ctx.lineTo(0,-r); ctx.lineTo(r*0.9,0); ctx.lineTo(0,r*0.9); ctx.closePath(); ctx.fill(); ctx.restore(); } }
    frame=requestAnimationFrame(loop); return ()=> cancelAnimationFrame(frame);
  },[running,gameOver,finished,answers,lives,paused,carReady]);

  const scoreUpdater = (delta:number, correct:boolean)=>{ setScore(s=>{ const ns=s+delta; if(correct){ decreaseWeight(currentQuestionIndexRef.current,0.6); if(ns>=targetScore) setFinished(true); } else { increaseWeight(currentQuestionIndexRef.current,4); } return ns; }); };
  const livesUpdater = (delta:number)=>{ setLives(l=>{ const nl = l+delta; if(nl<=0) return 0; return nl; }); };

  useEffect(()=>{ if(!finished && score>=targetScore){ setFinished(true); if(!completedLessons.includes(lesson._id)){ (async()=>{ try{ const username=session?.user?.username; setMarking(true); await finalizeLesson({ username, lessonId:lesson._id, courseId, type:lesson.type, earnedStar:lesson.type!=='markdown'}); setCompletedLessons(prev=> prev.includes(lesson._id)? prev:[...prev,lesson._id]); } finally { setMarking(false);} })(); } } },[score,targetScore,finished,completedLessons,lesson._id,lesson.type,courseId,session?.user?.username,setCompletedLessons]);

  return (
  <div ref={containerRef} className={"w-full flex justify-center " + (isFullscreen? 'fixed inset-0 z-50 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 p-6 overflow-hidden':'') }>
  <div ref={rowRef} className={"w-full max-w-6xl flex flex-col lg:flex-row gap-6 " + (isFullscreen? 'max-w-none h-full flex-row items-center':'items-start')} style={isFullscreen? {alignItems:'center'}:undefined}>
        {/* Canvas Bereich */}
  <div className={"relative mx-auto lg:mx-0 transition-all flex " + (isFullscreen? 'flex-1 justify-center':'')} style={{width:isFullscreen? 'auto': dynamicSize, maxWidth:isFullscreen? 'none': dynamicSize}}>
          <div className="relative" style={{width:dynamicSize, height:dynamicSize}}>
            <div
              onTouchStart={(e)=>{ const t=e.touches[0]; touchStartRef.current={ x:t.clientX, y:t.clientY, time: performance.now() }; }}
              onTouchEnd={(e)=>{ const s=touchStartRef.current; if(!s) return; const t=(e.changedTouches&&e.changedTouches[0])? e.changedTouches[0] : (e.touches[0]||null); if(!t) { touchStartRef.current=null; return;} const dx=t.clientX - s.x; const dy=t.clientY - s.y; const adx=Math.abs(dx), ady=Math.abs(dy); if(adx>40 && adx>ady){ if(dx>0) { desiredLaneRef.current = Math.min(LANES-1, desiredLaneRef.current+1); } else { desiredLaneRef.current = Math.max(0, desiredLaneRef.current-1); } } touchStartRef.current=null; }}
              style={{width:dynamicSize, height:dynamicSize, position:'absolute', inset:0 as any, touchAction:'none'}}
            />
            <canvas ref={canvasRef} width={LOGICAL_W} height={LOGICAL_H} className={"border rounded shadow " + (isFullscreen? 'bg-neutral-900':'bg-white')} style={{width:dynamicSize, height:dynamicSize}} />
            {running && !gameOver && !finished && (
              <>
                <div className="absolute inset-y-0 left-0 w-1/3 active:bg-black/10" onTouchStart={()=>{ desiredLaneRef.current = Math.max(0, desiredLaneRef.current-1); }} />
                <div className="absolute inset-y-0 right-0 w-1/3 active:bg-black/10" onTouchStart={()=>{ desiredLaneRef.current = Math.min(LANES-1, desiredLaneRef.current+1); }} />
                {/* In-Canvas Pause Button */}
                <button onClick={()=> setPaused(p=>!p)} className="absolute top-2 left-2 text-[11px] px-2 py-1 rounded bg-black/60 text-white hover:bg-black/70 backdrop-blur shadow border border-white/10">
                  {paused? 'Weiter':'Pause'}
                </button>
                <button onClick={toggleFullscreen} className="absolute top-2 right-2 text-[11px] px-2 py-1 rounded bg-black/60 text-white hover:bg-black/70 backdrop-blur shadow border border-white/10">
                  {isFullscreen? 'Exit':'Vollbild'}
                </button>
              </>
            )}
            <div className="absolute bottom-1 right-2 text-[9px] text-gray-500/70 select-none">v{VERSION}</div>
            {!running && !gameOver && !finished && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 text-center gap-3 p-4">
                <h2 className="text-xl font-bold">🚗 Auto Quiz</h2>
                <p className="text-[11px] max-w-xs">Links/Rechts = Spur wechseln. Triff das richtige Farbfeld.</p>
    <button onClick={start} className="px-5 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold">Start (Enter)</button>
              </div>
            )}
            {gameOver && !finished && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 text-center gap-3 p-4">
                <div className="text-red-600 font-bold text-2xl">Game Over</div>
                <div className="text-xs">Punkte: {score}</div>
    <button onClick={restart} className="px-5 py-2 rounded bg-red-600 hover:bg-red-700 text-white text-sm font-semibold">Neu starten</button>
              </div>
            )}
            {finished && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/85 text-center gap-3 p-4">
                <div className="text-green-600 font-bold text-2xl">✔ Ziel erreicht</div>
                <div className="text-xs">Punkte: {score}</div>
    <button onClick={restart} className="px-5 py-2 rounded bg-green-600 hover:bg-green-700 text-white text-sm font-semibold">Nochmal</button>
              </div>
            )}
          </div>
          {/* Steuerungshinweis entfernt laut Anforderung */}
        </div>
        {/* Seitenpanel */}
  <div ref={sidePanelRef} className={"flex-shrink-0 flex flex-col gap-4 z-10 transition-all " + (isFullscreen? '':'w-full lg:w-96')} style={isFullscreen? {width:fsPanelWidth, alignSelf:'center'}:{}}>
          <div className={"border rounded shadow-sm flex flex-col items-center text-center " + (isFullscreen? 'bg-neutral-800/80 backdrop-blur text-neutral-100 border-neutral-700 px-8 py-8 gap-7':'bg-white text-neutral-800 p-4 gap-5') } style={isFullscreen? {maxWidth:fsPanelWidth, margin:'0 auto'}:undefined}>
            <div className="space-y-4 w-full">
              <div className={"uppercase tracking-[0.18em] font-semibold opacity-80 " + (isFullscreen? 'text-[11px]':'text-xs text-gray-500')}>FRAGE</div>
              <div className={"font-semibold whitespace-pre-wrap break-words leading-snug w-full mx-auto " + (isFullscreen? 'text-lg lg:text-xl':'text-sm') + " min-h-[64px]"} style={isFullscreen? {lineHeight:1.25, fontSize:'clamp(1.15rem,1.1vw+0.9rem,2rem)', maxWidth:'54ch'}:undefined}>{questionText || '—'}</div>
            </div>
            <div className="space-y-4 w-full">
              <div className={"uppercase tracking-[0.18em] font-semibold opacity-80 " + (isFullscreen? 'text-[11px]':'text-xs text-gray-500')}>ANTWORT-SPUREN</div>
              <ul className={"flex flex-col gap-3 font-medium w-full mx-auto " + (isFullscreen? 'text-base max-w-[50ch]':'text-[11px]')}>
                {answers.map((a,i)=>(
                  <li key={i} ref={el=> { answerRefs.current[i]=el; }} className={"rounded px-4 py-3 text-white shadow-sm transition-transform will-change-transform " + (isFullscreen? 'hover:scale-[1.03] text-[15px]':'')} style={{background:a.color}}>{a.text}</li>
                ))}
              </ul>
            </div>
            <div className={"flex flex-wrap gap-6 justify-center font-semibold w-full " + (isFullscreen? 'text-[13px] text-neutral-300':'text-[11px] text-gray-700')}>
              <span>Punkte: {score}/{targetScore}</span>
              <span>Leben: {Array.from({length:MAX_LIVES}).map((_,i)=>(<span key={i} className={i<lives?'text-red-500':'text-gray-400'}>❤</span>))}</span>
            </div>
            <div className={"flex gap-3 flex-wrap justify-center w-full " + (isFullscreen? 'text-[13px]':'text-xs')}>
              {!running && !gameOver && !finished && (
                <button onClick={start} className="px-6 py-2.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">Start</button>
              )}
              {running && !paused && !gameOver && !finished && (
                <button onClick={()=> setPaused(true)} className={"px-5 py-2 rounded border  " + (isFullscreen? 'bg-neutral-700 hover:bg-neutral-600 border-neutral-600':'bg-gray-50 hover:bg-white')}>Pause</button>
              )}
              {running && paused && (
                <button onClick={()=> setPaused(false)} className={"px-5 py-2 rounded border  " + (isFullscreen? 'bg-neutral-700 hover:bg-neutral-600 border-neutral-600':'bg-gray-50 hover:bg-white')}>Weiter</button>
              )}
              {gameOver && !finished && (
                <button onClick={restart} className={"px-6 py-2.5 rounded font-semibold text-white " + (isFullscreen? 'bg-red-600 hover:bg-red-500':'bg-red-600 hover:bg-red-700')}>Neu</button>
              )}
              {finished && (
                <button onClick={restart} className={"px-6 py-2.5 rounded font-semibold text-white " + (isFullscreen? 'bg-indigo-600 hover:bg-indigo-500':'bg-indigo-600 hover:bg-indigo-700')}>Nochmal</button>
              )}
              <button onClick={toggleFullscreen} className={"px-5 py-2 rounded border " + (isFullscreen? 'bg-neutral-700 hover:bg-neutral-600 border-neutral-600 text-neutral-200':'bg-gray-50 hover:bg-white text-gray-800')}>{isFullscreen? 'Exit Vollbild':'Vollbild'}</button>
              {marking && <span className="text-[10px] text-gray-500">Speichere…</span>}
            </div>
            <div className={"leading-snug text-center w-full " + (isFullscreen? 'text-[12px] text-neutral-400 max-w-[60ch] mx-auto':'text-[10px] text-gray-500')}>Triff die Spur mit der richtigen Antwort. Richtige Spur einsammeln = +1 Punkt, falsch = Leben -1.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
