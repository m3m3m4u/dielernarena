"use client";
import { useEffect } from 'react';
import type { Lesson } from './types';

interface Props { lesson: Lesson; onCompleted: () => void; }

export default function YouTubeLesson({ lesson, onCompleted }: Props){
  const content = (lesson.content||{}) as any;
  const urlRaw = String(content.youtubeUrl || content.url || content.link || '');
  const text = typeof content.text === 'string' ? content.text : '';
  const videoId = extractYouTubeId(urlRaw);

  useEffect(()=>{
    if(!videoId) return; let player:any=null; let interval:number| null=null; let destroyed=false; let fallbackTimer:number| null=null; const state={playing:false, watched:0, duration:0, done:false};
    const ensureTick=()=>{ if(interval!=null)return; interval=window.setInterval(()=>{ if(document.hidden) return; if(state.playing){ state.watched+=0.5; const target= state.duration>0? state.duration:60; if(!state.done && state.watched>=target){ state.done=true; try{onCompleted();}catch{} if(interval){clearInterval(interval);interval=null;} } } },500); };
    const clear=()=>{ if(interval){ clearInterval(interval); interval=null;} if(fallbackTimer){ clearTimeout(fallbackTimer); fallbackTimer=null;} if(player && player.destroy) player.destroy()};
    // Fallback: wenn API nicht lädt, einfache Iframe-Einbettung nach 4s
    fallbackTimer = window.setTimeout(()=>{
      if(destroyed || player) return; const container=document.getElementById('yt-player-'+videoId); if(!container) return; if(container.childElementCount>0) return;
      const iframe=document.createElement('iframe');
      iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
      iframe.setAttribute('allowFullscreen', 'true');
      iframe.src=`https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1&modestbranding=1&rel=0`;
      iframe.style.width='100%'; iframe.style.height='100%'; iframe.style.border='0';
      container.appendChild(iframe);
    }, 4000);
  loadYouTubeAPI().then((YT)=>{ if(destroyed) return; const container=document.getElementById('yt-player-'+videoId); if(!container) return; player = new YT.Player(container,{ width: '100%', height: '100%', videoId, host: 'https://www.youtube-nocookie.com', playerVars:{rel:0, modestbranding:1, controls:1, playsinline:1, enablejsapi:1, iv_load_policy:3, origin: window.location.origin}, events:{ onReady:()=>{ try{ const d= player.getDuration?.()||0; if(typeof d==='number'&& d>0) state.duration=d;}catch{} }, onStateChange:(e:any)=>{ const YTPS=(window as any).YT?.PlayerState||{}; if(e.data===YTPS.PLAYING){ state.playing=true; if(!state.duration){ try{ const d= player.getDuration?.()||0; if(typeof d==='number'&& d>0) state.duration=d;}catch{} } ensureTick(); } else if(e.data===YTPS.PAUSED || e.data===YTPS.BUFFERING){ state.playing=false; } else if(e.data===YTPS.ENDED){ state.watched= state.duration || state.watched; state.playing=false; if(!state.done){ state.done=true; try{onCompleted();}catch{} clear(); } } } } }); });
    return ()=>{ destroyed=true; clear(); };
  },[videoId, onCompleted, lesson._id]);

  return <div>{videoId ? (
    <div className="mb-6">
      <div className="relative aspect-video w-full max-w-3xl mx-auto bg-black rounded overflow-hidden">
        <div id={'yt-player-'+videoId} className="absolute inset-0 w-full h-full" />
      </div>
    </div>
  ): (<p className="text-red-600">Ungültiger YouTube-Link.</p>)} {text && <div className="prose max-w-none">{text}</div>}</div>;
}

function extractYouTubeId(url: string): string | null { try{ const u=new URL(url); if(u.hostname.includes('youtu.be')) return u.pathname.replace('/','')||null; if(u.searchParams.get('v')) return u.searchParams.get('v'); const m=u.pathname.match(/\/embed\/([a-zA-Z0-9_-]{6,})/); if(m) return m[1]; return null;}catch{ if(/^[a-zA-Z0-9_-]{6,}$/.test(url)) return url; return null; } }
function loadYouTubeAPI(): Promise<any>{ return new Promise(res=>{ const w=window as any; if(w.YT && w.YT.Player) return res(w.YT); const prev=w.onYouTubeIframeAPIReady; w.onYouTubeIframeAPIReady=()=>{ prev?.(); res(w.YT); }; if(!document.getElementById('youtube-iframe-api')){ const s=document.createElement('script'); s.id='youtube-iframe-api'; s.src='https://www.youtube.com/iframe_api'; s.async=true; document.body.appendChild(s);} }); }
