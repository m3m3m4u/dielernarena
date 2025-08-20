"use client";
import { useState, useEffect, ComponentType, useRef, useCallback } from 'react';
import type { Lesson } from '.'; // Barrel import to avoid potential resolution issues
import { finalizeLesson } from '../../lib/lessonCompletion';

interface Props { lesson: Lesson; courseId: string; completedLessons: string[]; setCompletedLessons: (v: string[] | ((p: string[])=>string[])) => void; sessionUsername?: string; }

// Lazy Loader (einfach gehalten; könnte in eigenes Hook ausgelagert werden)
async function loadMarkdown(){
  const [m, g] = await Promise.all([
    import('react-markdown'),
    import('remark-gfm')
  ]);
  return { MD: m.default, gfm: (g as any).default ?? g };
}

export default function MarkdownLesson({ lesson, courseId, completedLessons, setCompletedLessons, sessionUsername }: Props){
  const [Comp, setComp] = useState<ComponentType<any>|null>(null);
  const [gfm, setGfm] = useState<any>(null);
  const [loadError, setLoadError] = useState<string| null>(null);
  const [showContent, setShowContent] = useState(true);
  const [marking, setMarking] = useState(false);
  const lastMarkedRef = useRef(false);

  useEffect(()=>{ let active=true; loadMarkdown().then(({MD, gfm})=>{ if(!active) return; setComp(()=>MD); setGfm(()=>gfm); }).catch(e=>{ if(active) setLoadError('Markdown konnte nicht geladen werden.'); }); return ()=>{ active=false; }; },[]);

  const alreadyDone = completedLessons.includes(lesson._id);

  const markCompleted = useCallback(async ()=>{
    if(alreadyDone || lastMarkedRef.current) return;
    lastMarkedRef.current = true;
    setMarking(true);
    try {
    await finalizeLesson({ username: sessionUsername, lessonId: lesson._id, courseId, type: lesson.type, earnedStar: true });
    setCompletedLessons(prev => prev.includes(lesson._id) ? prev : [...prev, lesson._id]);
    } catch {
      lastMarkedRef.current = false; // retry erlauben
    } finally { setMarking(false); }
  }, [sessionUsername, alreadyDone, courseId, lesson._id, lesson.type, setCompletedLessons]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Anleitung</h1>
        <button
          onClick={()=> setShowContent(s=>!s)}
          aria-pressed={showContent}
          className="text-sm px-3 py-1 rounded border bg-white hover:bg-gray-50 flex items-center gap-1"
        >
          {showContent ? '⬆️ Ausblenden' : '⬇️ Anzeigen'}
        </button>
      </div>
      {showContent && (
        <div className="prose max-w-none animate-fade-in" data-testid="markdown-content">
          {loadError && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{loadError}</div>}
          {!loadError && (Comp ? (
            <Comp remarkPlugins={gfm ? [gfm]: []}>{(lesson.content as any)?.markdown || ''}</Comp>
          ) : (
            <div className='text-gray-400'>Lade Inhalt…</div>
          ))}
        </div>
      )}
      <div className="mt-6 flex items-center gap-3">
        {!alreadyDone ? (
          <button
            onClick={markCompleted}
            disabled={marking || loadError!=null}
            className={`px-5 py-2 rounded text-white ${marking? 'bg-gray-400':'bg-green-600 hover:bg-green-700'} disabled:opacity-60`}
          >
            {marking? 'Speichere…' : '✅ Als erledigt markieren'}
          </button>
        ) : <span className="text-green-600 font-medium">✔️ Erledigt</span>}
        {marking && <span className="text-sm text-gray-500">Speichere Abschluss…</span>}
      </div>
    </div>
  );
}
