"use client";
import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Lesson, LessonContent } from '../types';
import { useSession } from 'next-auth/react';
import { finalizeLesson } from '../../../lib/lessonCompletion';
import { buildQuestionBlocks } from './questions';
import { createCloudGroup, preventOverlap, layoutCloudText, laneCenterY } from './clouds';
import { Cloud, LOGICAL_HEIGHT, LOGICAL_WIDTH, TOP_SAFE_ZONE } from './types';

// Diese Implementierung ist eine möglichst exakte Portierung der reinen JS-Version (game.js)
// in eine gekapselte React-Komponente. Layout & Logik orientieren sich Zeile für Zeile am Original.
// Unterschied: Fragen stammen aus lesson.content.blocks (gleich wie bei Snake) oder fallback zu lesson.questions.
// Abschlussbedingung: Score >= targetScore (analog Snake), ansonsten 3 Leben -> Game Over.

interface Props { lesson: Lesson; courseId: string; completedLessons: string[]; setCompletedLessons: (v: string[] | ((p:string[])=>string[]))=>void; }

// Konstanten (aus index.html + game.js)
// Konstanten jetzt in types.ts
const FORCE_MIN_DPR = 2;
const PLANE_DISPLAY_WIDTH = 126;
const PLANE_MIRRORED = true;
const BG_SCROLL_SPEED = 60;
const MAX_LIVES = 3;
// Kann über lesson.content.planeScale (0.2 - 1.0) überschrieben werden
const DEFAULT_DISPLAY_SCALE = 0.8; // vergrößert (~doppelt so groß wie vorher 0.4)

// Cloud Interface importiert

export default function PlaneGame({ lesson, courseId, completedLessons, setCompletedLessons }: Props){
  const { data: session } = useSession();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [running, setRunning] = useState(false); // wurde gestartet
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [clouds, setClouds] = useState<Cloud[]>([]);
  const cloudsRef = useRef<Cloud[]>([]); // für Render ohne Neumount des Game-Loops
  useEffect(()=>{ cloudsRef.current = clouds; }, [clouds]);
  const collisionCooldownRef = useRef(0); // Sekunden bis erneut gezählt wird
  const lastLifeCloudIdRef = useRef<number | null>(null); // verhindert Mehrfachabzug durch dieselbe Wolke
  // Globaler Flash für falsche Treffer
  const wrongFlashRef = useRef(0); // 0..1 alpha
  const [questionText, setQuestionText] = useState('');
  const [activeQuestionId, setActiveQuestionId] = useState(0);
  const questionIdCounterRef = useRef(0);
  const [marking, setMarking] = useState(false);
  const [finished, setFinished] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Zahl -> deutsches Wort (Basis für kleine Zahlen)
  const numWord = (n:number):string => {
    const basics: Record<number,string> = {0:'null',1:'eins',2:'zwei',3:'drei',4:'vier',5:'fünf',6:'sechs',7:'sieben',8:'acht',9:'neun',10:'zehn',11:'elf',12:'zwölf',13:'dreizehn',14:'vierzehn',15:'fünfzehn',16:'sechzehn',17:'siebzehn',18:'achtzehn',19:'neunzehn'};
    const tens: Record<number,string> = {20:'zwanzig',30:'dreißig',40:'vierzig',50:'fünfzig',60:'sechzig',70:'siebzig',80:'achtzig',90:'neunzig'};
    if(basics[n]!==undefined) return basics[n];
    if(tens[n]) return tens[n];
    if(n<100){
      const t = Math.floor(n/10)*10; const r = n%10;
      // z.B. 21 => einundzwanzig
      const rWord = r===1? 'ein': basics[r];
      return rWord + 'und' + tens[t];
    }
    return n.toString();
  };

  // Target Score aus lesson.content.targetScore analog Snake (Default 15)
  const targetScore = Number((lesson.content as LessonContent | undefined)?.targetScore) || 15;

  // Fragenquelle: versuche lesson.content.blocks (QuestionBlock), fallback lesson.questions (MC)
  const blocks = buildQuestionBlocks(lesson);

  // Plane State
  const planeRef = useRef({ x: LOGICAL_WIDTH * 0.35, y: LOGICAL_HEIGHT/2, w: 120, h: 60, vy:0, speed:420, angle:0, targetAngle:0 });
  const keysRef = useRef({ ArrowUp:false, ArrowDown:false });
  const lastTimeRef = useRef(0);
  const lastFrameDtRef = useRef(0);
  const bgOffsetRef = useRef(0);

  const planeImgRef = useRef<HTMLImageElement | null>(null);
  const planeReadyRef = useRef(false);
  // Pixelform Maske (Alpha) für präzisere Kollision
  const planeMaskRef = useRef<{data:Uint8ClampedArray; w:number; h:number} | null>(null);
  const planeMaskReadyRef = useRef(false);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const bgReadyRef = useRef(false);
  // Touch/Swipe
  const touchStartRef = useRef<{x:number;y:number;time:number}|null>(null);

  // Frage-Reihenfolge
  const questionOrderRef = useRef<number[]>([]);
  const questionIndexRef = useRef(0);

  const shuffleQuestions = useCallback(()=>{
    const n = blocks.length;
    questionOrderRef.current = [...Array(n).keys()];
    for(let i=n-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [questionOrderRef.current[i], questionOrderRef.current[j]] = [questionOrderRef.current[j], questionOrderRef.current[i]]; }
    questionIndexRef.current = 0;
  },[blocks.length]);

  const nextQuestion = useCallback(()=>{
    if(!blocks.length) return null;
    if(questionIndexRef.current >= questionOrderRef.current.length) shuffleQuestions();
    const q = blocks[ questionOrderRef.current[questionIndexRef.current] ];
    questionIndexRef.current +=1;
    return q;
  },[blocks, shuffleQuestions]);

  // laneCenterY, layoutCloudText, preventOverlap ausgelagert

  const spawnClouds = useCallback((append:boolean)=>{
    const canvas = canvasRef.current; if(!canvas) return; const ctx = canvas.getContext('2d'); if(!ctx) return;
    const q = nextQuestion(); if(!q) return;
  const newQid = questionIdCounterRef.current + 1; questionIdCounterRef.current = newQid; setActiveQuestionId(newQid);
  setQuestionText(q.question);
    setClouds(prev=>{
      const existing = append ? prev : [];
      const group = createCloudGroup(ctx, q, newQid, existing);
      return append ? group : group.slice(-4); // wenn nicht append, nur neue Gruppe
    });
  },[nextQuestion]);

  // Fullscreen
  const toggleFullscreen = () => {
    const el = wrapperRef.current; if(!el) return;
    if(!document.fullscreenElement){ el.requestFullscreen?.(); } else { document.exitFullscreen?.(); }
  };
  useEffect(()=>{ const handler=()=> setIsFullscreen(!!document.fullscreenElement); document.addEventListener('fullscreenchange', handler); return ()=> document.removeEventListener('fullscreenchange', handler); },[]);

  // Input
  useEffect(()=>{
    const handleKeyDown = (e:KeyboardEvent)=>{ if(e.code==='ArrowUp'||e.code==='ArrowDown'){ keysRef.current[e.code]=true; e.preventDefault(); }
      if(!running && e.code==='Enter'){ start(); }
      if(gameOver && e.code==='Enter'){ restart(); }
      if(running && !gameOver && (e.code==='KeyP' || e.code==='Space')){ setPaused(p=>!p); }
    };
    const handleKeyUp = (e:KeyboardEvent)=>{ if(e.code==='ArrowUp'||e.code==='ArrowDown'){ keysRef.current[e.code]=false; e.preventDefault(); } };
    window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
    return ()=>{ window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  },[running, gameOver]);

  // High-DPI Setup einmalig (ohne window-basiertes Resizing, damit unsere eigene Skalierung bleibt)
  useEffect(()=>{
    const canvas = canvasRef.current; if(!canvas) return; const ctx = canvas.getContext('2d'); if(!ctx) return;
    const sysDpr = window.devicePixelRatio || 1; const dpr = Math.max(sysDpr, FORCE_MIN_DPR);
    canvas.width = Math.round(LOGICAL_WIDTH * dpr); canvas.height = Math.round(LOGICAL_HEIGHT * dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0); ctx.imageSmoothingEnabled = true; (ctx as unknown as { imageSmoothingQuality?: string }).imageSmoothingQuality = 'high';
  },[]);

  // Dynamische CSS-Größe (Breite füllt Container, Höhe entsprechend Seitenverhältnis)
  useEffect(()=>{
    if(isFullscreen) return; // Fullscreen handled separately
    const canvas = canvasRef.current; const wrapper = wrapperRef.current; if(!canvas || !wrapper) return;
    const ro = new ResizeObserver(entries=>{
      const w = entries[0].contentRect.width;
      canvas.style.width = w + 'px';
      canvas.style.height = (w * (LOGICAL_HEIGHT/LOGICAL_WIDTH)) + 'px';
    });
    ro.observe(wrapper);
    return ()=> ro.disconnect();
  },[isFullscreen]);

  // Assets laden
  useEffect(()=>{
    const planeImg = new Image(); planeImg.onload=()=>{ 
      planeReadyRef.current=true; 
      // Verwende natural* oder Fallbacks
  const natW = planeImg.naturalWidth || planeImg.width || 320; 
  const natH = planeImg.naturalHeight || planeImg.height || 160; 
      const aspect = natH / natW || 0.5; 
      planeRef.current.w = PLANE_DISPLAY_WIDTH; planeRef.current.h = Math.max(20, PLANE_DISPLAY_WIDTH * aspect); 
      try {
        const mw = Math.round(planeRef.current.w);
        const mh = Math.round(planeRef.current.h);
        const off = document.createElement('canvas'); off.width = mw; off.height = mh; const octx = off.getContext('2d');
        if(octx){
          if(PLANE_MIRRORED){
            octx.save();
            octx.translate(mw,0); octx.scale(-1,1);
            octx.drawImage(planeImg,0,0,mw,mh);
            octx.restore();
          } else {
            octx.drawImage(planeImg,0,0,mw,mh);
          }
          const imgData = octx.getImageData(0,0,mw,mh);
          planeMaskRef.current = { data: imgData.data, w: mw, h: mh };
          planeMaskReadyRef.current = true;
        }
  } catch(err){ console.warn('Plane mask build failed', err); }
    }; 
    planeImg.onerror = ()=> console.warn('PlaneGame: /media/flugzeug.svg konnte nicht geladen werden');
    planeImg.src='/media/flugzeug.svg'; planeImgRef.current=planeImg;
    const bgImg = new Image(); bgImg.onload=()=>{ bgReadyRef.current=true; }; bgImg.onerror=()=> console.warn('PlaneGame: /media/hintergrundbild.png konnte nicht geladen werden'); bgImg.src='/media/hintergrundbild.png'; bgImgRef.current=bgImg;
  },[]);

  // Start / Restart
  const start = ()=>{ if(!blocks.length) return; setRunning(true); setPaused(false); setGameOver(false); setScore(0); setLives(MAX_LIVES); setFinished(false); collisionCooldownRef.current = 0; planeRef.current = { x: LOGICAL_WIDTH * 0.35, y: LOGICAL_HEIGHT/2, w: planeRef.current.w, h: planeRef.current.h, vy:0, speed:420, angle:0, targetAngle:0 }; setClouds([]); cloudsRef.current=[]; shuffleQuestions(); spawnClouds(false); };
  const restart = ()=> start();

  // Game Loop
  useEffect(()=>{
    if(!running) return;
    const canvas = canvasRef.current; if(!canvas) return; const ctx = canvas.getContext('2d'); if(!ctx) return;
  // Frame Handle
  let frameHandle:number;
    const aabb = (a:{x:number;y:number;w:number;h:number}, b:{x:number;y:number;w:number;h:number})=> Math.abs(a.x-b.x) <= (a.w+b.w)*0.5 && Math.abs(a.y-b.y) <= (a.h+b.h)*0.5;
    function precisePlaneCloudCollision(cloud:Cloud){
      const plane = planeRef.current;
      // Grober Vorabtest
      if(!aabb({x:plane.x,y:plane.y,w:plane.w,h:plane.h},{x:cloud.x,y:cloud.y,w:cloud.w,h:cloud.h})) return false;
      if(!planeMaskReadyRef.current || !planeMaskRef.current) return true; // fallback: akzeptiere groben Treffer wenn Maske fehlt
      const mask = planeMaskRef.current;
      // Schnittrechteck in Weltkoordinaten
      const left = plane.x - plane.w/2;
      const top = plane.y - plane.h/2;
      const cloudRx = cloud.w/2; const cloudRy = cloud.h/2;
      // Wir laufen über Maske in Schrittweite 2 für Performance
      const step = 2;
      const data = mask.data;
      for(let my=0; my<mask.h; my+=step){
        const wy = top + my; // Welt Y
        // Schnell außerhalb vertikal
        if(Math.abs(wy - cloud.y) > cloudRy) continue;
        for(let mx=0; mx<mask.w; mx+=step){
          const wx = left + mx;
          if(Math.abs(wx - cloud.x) > cloudRx) continue; // horizontal schneller Filter
          const idx = (my*mask.w + mx)*4 + 3; // Alpha-Kanal
          if(data[idx] > 32){
            // Punkt innerhalb Ellipse?
            const dx = (wx - cloud.x)/cloudRx;
            const dy = (wy - cloud.y)/cloudRy;
            if(dx*dx + dy*dy <= 1){
              return true;
            }
          }
        }
      }
      return false;
    }

    const update = (dt:number)=>{
      if(paused || gameOver) { lastFrameDtRef.current = 0; return; }
  lastFrameDtRef.current = dt;
  if(collisionCooldownRef.current>0){ collisionCooldownRef.current = Math.max(0, collisionCooldownRef.current - dt); }
      const plane = planeRef.current;
      if(keysRef.current.ArrowUp) plane.y -= plane.speed * dt;
      if(keysRef.current.ArrowDown) plane.y += plane.speed * dt;
      plane.y = Math.max(TOP_SAFE_ZONE + plane.h/2 + 5, Math.min(LOGICAL_HEIGHT-40, plane.y));
      if(keysRef.current.ArrowUp && !keysRef.current.ArrowDown) plane.targetAngle=-30; else if(keysRef.current.ArrowDown && !keysRef.current.ArrowUp) plane.targetAngle=30; else plane.targetAngle = 0; plane.angle += (plane.targetAngle - plane.angle) * Math.min(1, dt*10);

      setClouds(prev=>{
        let correctHit = false;
        let collidedThisFrame = false;
  let arr: Cloud[] = [];
        for(const c of prev){
          const nc: Cloud = { ...c, prevX: c.x };
          nc.x -= nc.speed * dt;
          if(collisionCooldownRef.current===0 && !collidedThisFrame && nc.active && !nc.hit && precisePlaneCloudCollision(nc)){
            nc.hit = true; nc.active = false; nc.hitTime = 0; collidedThisFrame = true; // deaktivieren verhindert weitere Treffer
            if(nc.correct){
              correctHit = true; setScore(s=>s+1);
            } else {
              if(!nc.lifePenalized && nc.id !== lastLifeCloudIdRef.current){
                nc.lifePenalized = true; lastLifeCloudIdRef.current = nc.id ?? null;
                setLives(l=>{ const n=Math.max(0,l-1); if(n<=0) triggerGameOver(); return n; });
              }
              // Effektparameter
              nc.speed = nc.speed * 0.55; // etwas langsamer, aber nicht komplett stoppen
              // mark wrong effect via alpha fade only (no type pollution)
              wrongFlashRef.current = 1; // globaler Flash starten
            }
            collisionCooldownRef.current = 0.35; // etwas längerer Lockout
          }
          arr.push(nc);
        }
        if(!correctHit){
          for(const c of arr){ if(c.active && c.x + c.w < -150 && !c.hit){
            const others = arr.filter(o=>o!==c && !o.hit);
            let attempts=0; do { c.lane=Math.floor(Math.random()*4); attempts++; } while(others.some(o=>o.lane===c.lane) && attempts<10);
            c.y = laneCenterY(c.lane, c.h);
            const layout = layoutCloudText(ctx, c.text, c.w, c.h, {maxFont:26, minFont:4, hPadding:28, vPadding:12});
            c.fontSize=layout.fontSize; c.lines=layout.lines; c.lineHeight=layout.lineHeight;
            c.speed=220+Math.random()*40;
            const rightMost = Math.max(...arr.map(cl=>cl===c?-Infinity:cl.x + cl.w/2));
            c.x = Math.max(LOGICAL_WIDTH + 100 + Math.random()*120, rightMost + c.w/2 + 120);
            preventOverlap(arr);
          }}
        } else {
          const lastQ = activeQuestionId;
          // alte Fragewolken komplett entfernen (auch getroffene) für frischen Spawn
          const filtered = arr.filter(c=> c.qid !== lastQ);
          arr = filtered;
          setTimeout(()=> spawnClouds(false),0); // neue Gruppe ersetzt alte
        }
        arr.forEach(c=>{ if(c.hit){ c.hitTime=(c.hitTime||0)+dt; if(!c.correct){ // Fade Out nach 0.6s
              if(c.hitTime>0.6){ const t = Math.min(1,(c.hitTime-0.6)/0.35); c.alpha = 1 - t; if(c.alpha<=0) c.active=false; }
            }} });
  // Global Flash alpha reduzieren
  if(wrongFlashRef.current>0){ wrongFlashRef.current = Math.max(0, wrongFlashRef.current - dt*2.5); }
        const cleaned = arr.filter(c=> {
          // Entferne falsche getroffene Wolken nach Fade-Out
          if(c.hit && !c.correct && c.hitTime && c.hitTime>0.75 && (c.alpha!==undefined && c.alpha<=0)) return false;
          return !( !c.active && c.x + c.w < -200);
        });
        cloudsRef.current = cleaned;
        return cleaned;
      });
    };

    const triggerGameOver = ()=>{ setGameOver(true); };

  function loopFrame(timestamp:number){ const last = lastTimeRef.current || timestamp; const dt = (timestamp - last)/1000; lastTimeRef.current = timestamp; update(dt); render(); frameHandle = requestAnimationFrame(loopFrame); }
    const render = ()=>{
      const ctx = canvas.getContext('2d'); if(!ctx) return;
      ctx.clearRect(0,0,LOGICAL_WIDTH,LOGICAL_HEIGHT);
      drawScrollingBackground(ctx);
      // Immer aktuelle Ref nutzen
      cloudsRef.current.forEach(c=> drawCloud(ctx,c));
      drawPlane(ctx);
      // Globaler roter Flash bei falscher Antwort (kurz)
      if(wrongFlashRef.current>0){
        const a = 0.35 * wrongFlashRef.current; // maximale Alpha 0.35
        ctx.fillStyle = `rgba(255,0,0,${a})`;
        ctx.fillRect(0,0,LOGICAL_WIDTH,LOGICAL_HEIGHT);
      }
      if(paused && !gameOver){
        ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.fillRect(0,0,LOGICAL_WIDTH,LOGICAL_HEIGHT);
        ctx.fillStyle='#fff'; ctx.font='48px system-ui'; ctx.textAlign='center'; ctx.fillText('PAUSE', LOGICAL_WIDTH/2, LOGICAL_HEIGHT/2);
        ctx.font='20px system-ui'; ctx.fillText('P oder Space zum Fortsetzen', LOGICAL_WIDTH/2, LOGICAL_HEIGHT/2 + 40);
      }
    };
  const drawPlane = (ctx:CanvasRenderingContext2D)=>{ const plane=planeRef.current; ctx.save(); ctx.translate(plane.x, plane.y); ctx.rotate(plane.angle * Math.PI/180); if(planeReadyRef.current && planeImgRef.current){ ctx.imageSmoothingEnabled=true; (ctx as any).imageSmoothingQuality='high'; if(PLANE_MIRRORED) ctx.scale(-1,1); ctx.drawImage(planeImgRef.current, -plane.w/2, -plane.h/2, plane.w, plane.h); } else { ctx.fillStyle='#f33'; ctx.fillRect(-plane.w/2, -plane.h/2, plane.w, plane.h); } ctx.restore(); };
  const drawScrollingBackground = (ctx:CanvasRenderingContext2D)=>{ if(bgReadyRef.current && bgImgRef.current){ const iw=bgImgRef.current.naturalWidth || bgImgRef.current.width; const ih=bgImgRef.current.naturalHeight || bgImgRef.current.height; if(iw>0 && ih>0){ const scale = LOGICAL_HEIGHT / ih; const tileW = iw*scale; const tileH=LOGICAL_HEIGHT; bgOffsetRef.current -= BG_SCROLL_SPEED * lastFrameDtRef.current; if(bgOffsetRef.current <= -tileW){ bgOffsetRef.current = bgOffsetRef.current % tileW; } let startX = bgOffsetRef.current; while(startX > 0) startX -= tileW; for(let x=startX; x<LOGICAL_WIDTH; x+=tileW){ ctx.drawImage(bgImgRef.current,x,0,tileW,tileH); } ctx.fillStyle='rgba(255,255,255,0.08)'; ctx.fillRect(0,0,LOGICAL_WIDTH,LOGICAL_HEIGHT); } else { ctx.fillStyle='#4c9be2'; ctx.fillRect(0,0,LOGICAL_WIDTH,LOGICAL_HEIGHT);} } else { const grad=ctx.createLinearGradient(0,0,0,LOGICAL_HEIGHT); grad.addColorStop(0,'#4c9be2'); grad.addColorStop(1,'#b5ddff'); ctx.fillStyle=grad; ctx.fillRect(0,0,LOGICAL_WIDTH,LOGICAL_HEIGHT); } };
    const drawCloud = (ctx:CanvasRenderingContext2D, c:Cloud)=>{
      ctx.save();
      ctx.translate(c.x, c.y);
      let scale = 1;
      if(c.hit){
        const t = Math.min(0.25, c.hitTime||0)/0.25; // 0..1
        const bump = c.correct ? 0.3 : 0.25;
        scale = 1 + bump * (1 - t);
      }
      ctx.scale(scale, scale);
      // Form
      ctx.beginPath();
      ctx.ellipse(0,0,c.w/2,c.h/2,0,0,Math.PI*2);
      // Füllverlauf
      const grad = ctx.createLinearGradient(0,-c.h/2,0,c.h/2);
      if(c.hit){
        if(c.correct){
          grad.addColorStop(0,'#d6ffe4');
          grad.addColorStop(1,'#42d96d');
        } else {
          const pulse = 0.5 + 0.5 * Math.sin((c.hitTime||0)*10);
          const c1 = 224 + Math.round(16*pulse); // 224..240
          const c2 = 123 + Math.round(60*(1-pulse)); // 123..183
          grad.addColorStop(0,`rgb(255,${Math.max(0,c1-60)},${Math.max(0,c1-60)})`);
          grad.addColorStop(1,`rgb(255,${c2},${c2})`);
        }
      } else {
        grad.addColorStop(0,'#ffffff');
        grad.addColorStop(1,'#e6f1ff');
      }
      ctx.fillStyle = grad;
      ctx.shadowColor='rgba(0,0,0,0.18)';
      ctx.shadowBlur=10; ctx.shadowOffsetY=4;
      ctx.globalAlpha = c.alpha!==undefined ? c.alpha : 1;
      ctx.fill();
      ctx.shadowColor='transparent';
      // Randfarben
      if(!c.hit){
        ctx.lineWidth=2; ctx.strokeStyle='rgba(0,0,0,0.15)'; ctx.stroke();
      } else if(c.correct){
        ctx.lineWidth=5; ctx.strokeStyle='#0d9234'; ctx.stroke();
      } else { // falsche Wolke – pulsierender Rand
        const pulse = 0.5 + 0.5 * Math.sin((c.hitTime||0)*14);
        ctx.lineWidth = 5 + 4*pulse;
        ctx.strokeStyle = `rgba(255,0,0,${0.65 + 0.3*pulse})`;
        ctx.stroke();
        // Glow Ring
        ctx.lineWidth = 2 + 2*pulse;
        ctx.strokeStyle = `rgba(255,180,180,${0.35 + 0.25*pulse})`;
        ctx.stroke();
      }
      // Textfarbe
      ctx.fillStyle = c.hit && !c.correct ? '#400' : '#222';
      const fs = c.fontSize || 26; ctx.font = `600 ${fs}px system-ui`; ctx.textAlign='center'; ctx.textBaseline='middle';
      if(c.lines && c.lines.length){
        const totalH = c.lines.length * c.lineHeight;
        for(let i=0;i<c.lines.length;i++){
          const line = c.lines[i];
            const cy = (i+0.5)*c.lineHeight - totalH/2;
          ctx.fillText(line,0,cy);
        }
      } else {
        ctx.fillText(c.text,0,2);
      }
      ctx.restore();
      // Externer Ring (nicht mit Wolke mitskaliert) für falsche Treffer für stärkeren Fokus
      if(c.hit && !c.correct){
        ctx.save();
        ctx.translate(c.x, c.y);
        const pulse = 0.5 + 0.5 * Math.sin((c.hitTime||0)*12);
        const radius = Math.max(c.w,c.h)*0.65 + 12 * pulse;
        ctx.lineWidth = 10 + 6*pulse;
        ctx.strokeStyle = `rgba(255,50,50,${0.55 + 0.35*pulse})`;
        ctx.beginPath();
        ctx.ellipse(0,0,radius,radius*0.65,0,0,Math.PI*2);
        ctx.stroke();
        // zweiter Glow-Ring
        ctx.lineWidth = 4 + 2*pulse;
        ctx.strokeStyle = `rgba(255,180,180,${0.35 + 0.25*pulse})`;
        ctx.beginPath();
        ctx.ellipse(0,0,radius*1.15,radius*0.65*1.15,0,0,Math.PI*2);
        ctx.stroke();
        ctx.restore();
      }
    };

  frameHandle = requestAnimationFrame(loopFrame);
  return ()=> cancelAnimationFrame(frameHandle);
  },[running, paused, gameOver, spawnClouds, activeQuestionId, nextQuestion]);

  // Completion analog Snake
  useEffect(()=>{ if(!finished && score >= targetScore){ setFinished(true); if(!completedLessons.includes(lesson._id)){ (async()=>{ try{ const username=session?.user?.username; setMarking(true); await finalizeLesson({ username, lessonId: lesson._id, courseId, type: lesson.type, earnedStar: lesson.type !== 'markdown' }); setCompletedLessons(prev=> prev.includes(lesson._id)? prev: [...prev, lesson._id]); } finally { setMarking(false);} })(); } } },[score, targetScore, finished, completedLessons, lesson._id, lesson.type, courseId, session?.user?.username, setCompletedLessons]);

  // Skalierung aus Lesson-Content (optional)
  const contentScaleRaw = Number((lesson.content as LessonContent | undefined)?.planeScale);
  const DISPLAY_SCALE = (!isNaN(contentScaleRaw) && contentScaleRaw>0.15 && contentScaleRaw<=1) ? contentScaleRaw : DEFAULT_DISPLAY_SCALE;
  const displayWidth = Math.round(LOGICAL_WIDTH * DISPLAY_SCALE); // bleibt für evtl. zukünftige Skalen-Logik vorhanden

  // Fullscreen dynamische Anpassung (Canvas soll Viewport maximal ausfüllen bei 16:9)
  useEffect(()=>{
    function apply(){
      const canvas = canvasRef.current; if(!canvas) return;
      if(isFullscreen){
        const vw = window.innerWidth; const vh = window.innerHeight;
        const targetRatio = LOGICAL_WIDTH / LOGICAL_HEIGHT;
        let w = vw; let h = Math.round(w / targetRatio);
        if(h > vh){ h = vh; w = Math.round(h * targetRatio); }
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        canvas.style.maxWidth = '100vw';
      } else {
        const canvas = canvasRef.current; if(!canvas) return;
        canvas.style.width = displayWidth + 'px';
        canvas.style.height = Math.round(displayWidth * (LOGICAL_HEIGHT/LOGICAL_WIDTH)) + 'px';
        canvas.style.maxWidth = '100%';
      }
    }
    apply();
    if(isFullscreen){
      window.addEventListener('resize', apply);
      return ()=> window.removeEventListener('resize', apply);
    }
  },[displayWidth, isFullscreen]);
  return (
    <div
      ref={wrapperRef}
      className={isFullscreen ? 'w-screen h-screen bg-black relative overflow-hidden' : 'w-full py-4'}
      onTouchStart={(e)=>{ const t=e.touches[0]; touchStartRef.current={ x:t.clientX, y:t.clientY, time: performance.now() }; }}
      onTouchEnd={(e)=>{ const s=touchStartRef.current; if(!s) return; const t=(e.changedTouches&&e.changedTouches[0])? e.changedTouches[0] : (e.touches[0]||null); if(!t){ touchStartRef.current=null; return; } const dx=t.clientX-s.x; const dy=t.clientY-s.y; const adx=Math.abs(dx), ady=Math.abs(dy); if(ady>36 && ady>adx){ if(dy<0){ // nach oben wischen
            keysRef.current.ArrowUp = true; keysRef.current.ArrowDown = false; setTimeout(()=>{ keysRef.current.ArrowUp=false; }, 140);
          } else { // nach unten wischen
            keysRef.current.ArrowDown = true; keysRef.current.ArrowUp = false; setTimeout(()=>{ keysRef.current.ArrowDown=false; }, 140);
          } }
          touchStartRef.current=null; }}
      style={{touchAction:'none'}}
    >
      <div className={isFullscreen ? 'relative w-full h-full' : 'mx-auto w-full'} style={ isFullscreen ? {width:'100%', height:'100%'} : {width:'100%'} }>
        {isFullscreen && (
          <div className="absolute top-0 left-0 w-full h-[160px] bg-black/90 backdrop-blur-sm flex items-center gap-6 px-6 z-20">
            <div className="flex items-center gap-4">
              {running && !gameOver && !finished && (
                <button
                  onClick={()=> setPaused(p=>!p)}
                  className="h-24 w-24 rounded-full bg-white/75 hover:bg-white text-gray-900 text-2xl font-bold flex items-center justify-center shadow-lg border border-white/60 tracking-wide"
                  title={paused? 'Weiter':'Pause'}
                >{paused? 'Weiter':'Pause'}</button>
              )}
              {(running || (!running && !finished && !gameOver)) && (
                <button
                  onClick={toggleFullscreen}
                  className="h-24 w-24 rounded-full bg-white/75 hover:bg-white text-gray-900 text-2xl font-bold flex items-center justify-center shadow-lg border border-white/60 tracking-wide"
                  title={isFullscreen? 'Vollbild verlassen':'Vollbild'}
                >Zurück</button>
              )}
            </div>
            <div className="flex-1 flex justify-center">
              {questionText && running && !gameOver && !finished && (
                <div className="pointer-events-none bg-white/10 text-white text-center text-3xl font-semibold px-10 py-6 rounded-xl max-w-[60%] leading-snug line-clamp-3">
                  {questionText}
                </div>
              )}
            </div>
            <div className="flex flex-col items-end justify-center gap-4 pr-2">
              <span className="text-white font-semibold text-[2.6rem] leading-none tracking-wider drop-shadow-[0_0_6px_rgba(0,0,0,0.6)]">{'❤'.repeat(Math.max(0, lives))}</span>
              <span className="text-white font-bold text-[2.7rem] leading-none drop-shadow-[0_0_8px_rgba(0,0,0,0.65)]">Punkte: {score}/{targetScore}</span>
            </div>
          </div>
        )}
  <div className="relative w-full" style={ isFullscreen ? {width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', paddingTop: '160px'} : {width:'100%'} }>
          <canvas
          ref={canvasRef}
          width={LOGICAL_WIDTH}
          height={LOGICAL_HEIGHT}
          className={isFullscreen ? 'block h-auto rounded bg-black' : 'block h-auto w-full rounded shadow-lg bg-gradient-to-b from-sky-500 to-sky-300'}
          style={ isFullscreen ? { aspectRatio: `${LOGICAL_WIDTH}/${LOGICAL_HEIGHT}` } : { width: '100%', aspectRatio: `${LOGICAL_WIDTH}/${LOGICAL_HEIGHT}`, maxWidth:'100%' } }
        />
        {/* Frage */}
  {!isFullscreen && questionText && running && !gameOver && !finished && (
          <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-center text-xl sm:text-2xl font-semibold px-4 py-2 rounded-lg max-w-[90%] whitespace-pre-wrap">
            {questionText}
          </div>
        )}
        {/* Scoreboard */}
        {!isFullscreen && (
          <div className="absolute top-1 right-1 flex items-center gap-3 text-white font-semibold drop-shadow-md text-[10px] sm:text-xs">
            <span className="tracking-wide">{'❤'.repeat(Math.max(0, lives))}</span>
            <span>Punkte: {score}/{targetScore}</span>
          </div>)
        }
        {/* Start Overlay */}
        {!running && !finished && !gameOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 text-center text-white p-4">
            <h2 className="text-2xl font-bold mb-3">✈️ Flugzeug Quiz</h2>
            <p className="mb-3 max-w-sm text-xs sm:text-sm">Steuere mit ↑ / ↓ durch die richtige Antwort-Wolke. Enter oder Button startet.</p>
            <button onClick={start} className="px-5 py-2 rounded bg-amber-400 hover:bg-amber-500 text-black font-semibold text-xs shadow">Start (Enter)</button>
            <p className="mt-4 text-[10px] text-white/70">Punkte-Ziel: {targetScore}</p>
          </div>
        )}
        {/* Pause Overlay */}
        {running && paused && !gameOver && !finished && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white text-center p-3">
            <div className="text-xl font-bold mb-3">Pause</div>
            <button onClick={()=> setPaused(false)} className="px-4 py-1.5 rounded bg-white text-gray-800 text-xs font-semibold">Weiter</button>
          </div>
        )}
        {/* Game Over */}
        {gameOver && !finished && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-center p-4 text-white">
            <div className="text-red-400 font-bold text-2xl mb-3">Game Over</div>
            <div className="text-xs mb-3">Punkte: {score}</div>
            <button onClick={restart} className="px-5 py-2 rounded bg-red-500 hover:bg-red-600 text-white text-xs font-semibold">Neu starten</button>
          </div>
        )}
        {/* Finished */}
        {finished && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-center p-4 text-white">
            <div className="text-green-400 font-bold text-2xl mb-2">✔ Ziel erreicht</div>
            <div className="text-xs mb-3">Punkte: {score}</div>
            <button onClick={restart} className="px-5 py-2 rounded bg-green-500 hover:bg-green-600 text-white text-xs font-semibold">Nochmal</button>
          </div>
        )}
        {/* Marking */}
        {marking && (
          <div className="absolute bottom-2 left-2 text-[11px] px-2 py-1 rounded bg-white/70 text-gray-700">Speichere Abschluss…</div>
        )}
        {/* Steuerungstipp */}
  <div className="absolute bottom-1 left-2 text-[9px] sm:text-[10px] text-white/80 drop-shadow">↑ / ↓ steuern • P / Space Pause</div>
        {/* Pause Button klein oben links */}
        {!isFullscreen && running && !gameOver && !finished && (
          <div className="absolute top-2 left-2 flex gap-2">
            <button onClick={()=> setPaused(p=>!p)} className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/70 hover:bg-white text-gray-900 text-[9px] sm:text-[10px] font-semibold flex items-center justify-center shadow border border-white/50 backdrop-blur" title={paused? 'Weiter':'Pause'}>
              {paused? 'Weiter':'Pause'}
            </button>
            <button onClick={toggleFullscreen} className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/70 hover:bg-white text-gray-900 text-[9px] sm:text-[10px] font-semibold flex items-center justify-center shadow border border-white/50 backdrop-blur" title={isFullscreen? 'Vollbild verlassen':'Vollbild'}>
              {isFullscreen? 'Zurück':'Vollbild'}
            </button>
          </div>
        )}
        {!isFullscreen && !running && !finished && !gameOver && (
          <button onClick={toggleFullscreen} className="absolute top-2 left-2 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/70 hover:bg-white text-gray-900 text-[9px] sm:text-[10px] font-semibold flex items-center justify-center shadow border border-white/50 backdrop-blur" title={isFullscreen? 'Vollbild verlassen':'Vollbild'}>
            {isFullscreen? 'Zurück':'Vollbild'}
          </button>
        )}
        </div>
      </div>
    </div>
  );
}
