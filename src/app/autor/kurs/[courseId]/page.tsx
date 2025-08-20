"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname, useParams } from "next/navigation";
import { useToast } from "@/components/shared/ToastProvider";
import { useSession } from 'next-auth/react';
import MediaLibrary from '@/components/media/MediaLibrary';

// Minimale Typen für diese Seite
type LessonListItem = {
  _id?: string;
  id?: string;
  title: string;
  description?: string;
  type: string;
  questions?: Array<unknown>;
  createdAt?: string;
  addedAt?: string;
  courseId?: string;
  courseIds?: string[];
  content?: Record<string, unknown>;
};

export default function CourseEditorPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const { data: session } = useSession();
  const { toast } = useToast();

  const courseId = String(params?.courseId || '');
  const inTeacher = pathname?.startsWith('/teacher/');
  const role = (session?.user as any)?.role as string | undefined;
  // Teacher-Bereich: Medien stets read-only; Autor/Admin nur im Autor-Bereich upload
  const canUpload = inTeacher ? false : (role === 'author' || role === 'admin');

  const [activeTab, setActiveTab] = useState<'overview'|'create-lesson'|'existing-lessons'|'media'>('overview');
  const [actualLessonsCount, setActualLessonsCount] = useState(0);

  const loadActualLessonsCount = useCallback(async () => {
    if (!courseId) return;
    try {
      const res = await fetch(`/api/kurs/${courseId}/lektionen`);
      const d = await res.json().catch(()=>({}));
      const arr = Array.isArray(d) ? d : (Array.isArray(d?.lessons) ? d.lessons : []);
      setActualLessonsCount((arr as any[]).length || 0);
    } catch {/* ignore */}
  }, [courseId]);

  useEffect(() => { void loadActualLessonsCount(); }, [loadActualLessonsCount]);

  const handleDeleteLesson = async (lessonId: string) => {
    if (!lessonId) return;
    if (!confirm('Lektion wirklich löschen?')) return;
    try {
      const res = await fetch(`/api/kurs/${courseId}/lektionen/${lessonId}`, { method: 'DELETE' });
      const d = await res.json().catch(()=>({}));
      if(!res.ok || !d?.success){
        toast({ kind:'error', title:'Löschen fehlgeschlagen', message: d?.error || 'Bitte erneut versuchen.' });
        return;
      }
      toast({ kind:'success', title:'Gelöscht', message: 'Die Lektion wurde entfernt.' });
      void loadActualLessonsCount();
    } catch {
      toast({ kind:'error', title:'Netzwerkfehler', message: 'Löschen nicht möglich.' });
    }
  };

  return (
    <main className="max-w-6xl mx-auto mt-8 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <a href={inTeacher? '/teacher/kurse' : '/autor'} className="text-sm text-blue-600 hover:underline">← Zurück</a>
          <h1 className="text-2xl font-bold">Kurs bearbeiten</h1>
        </div>
        <button
          onClick={() => router.push(inTeacher ? `/teacher/kurs/${courseId}/einstellungen` : `/autor/kurs/${courseId}/einstellungen`)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          ⚙️ Einstellungen
        </button>
      </div>

      <div className="bg-white border rounded">
        <div className="border-b">
          <div className="flex">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-6 py-3 font-medium ${activeTab === 'overview' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
            >
              📋 Lektionen ({actualLessonsCount})
            </button>
            <button
              onClick={() => setActiveTab('create-lesson')}
              className={`px-6 py-3 font-medium ${activeTab === 'create-lesson' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
            >
              ➕ Neue Lektion
            </button>
            <button
              onClick={() => setActiveTab('existing-lessons')}
              className={`px-6 py-3 font-medium ${activeTab === 'existing-lessons' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
            >
              📚 Vorhandene einfügen
            </button>
            <button
              onClick={() => setActiveTab('media')}
              className={`px-6 py-3 font-medium ${activeTab === 'media' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
            >
              🖼️ Medien
            </button>
          </div>
        </div>
        <div className="p-6">
          {activeTab === 'overview' && (
            <LessonsOverviewTab courseId={courseId} onDelete={handleDeleteLesson} onLessonsCountChange={setActualLessonsCount} />
          )}
          {activeTab === 'create-lesson' && (
            <CreateLessonTab courseId={courseId} onLessonCreated={loadActualLessonsCount} />
          )}
          {activeTab === 'existing-lessons' && (
            <ExistingLessonsTab courseId={courseId} onLessonAdded={loadActualLessonsCount} />
          )}
          {activeTab === 'media' && (
            <MediaLibrary canUpload={!!canUpload} />
          )}
        </div>
      </div>
    </main>
  );
}

function LessonsOverviewTab({ courseId, onDelete, onLessonsCountChange }: { courseId: string; onDelete: (id: string) => void; onLessonsCountChange: (count: number) => void; }) {
  const router = useRouter();
  const pathname = usePathname();
  const inTeacherContext = pathname?.startsWith('/teacher/');
  const [courseLessons, setCourseLessons] = useState<LessonListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [localOrder, setLocalOrder] = useState<string[]>([]);

  const moveLesson = (id: string, dir: number) => {
    setLocalOrder(prev => {
      const arr = [...prev];
      const idx = arr.indexOf(id);
      if (idx === -1) return prev;
      const ni = idx + dir;
      if (ni < 0 || ni >= arr.length) return prev;
      const tmp = arr[idx]; arr[idx] = arr[ni]; arr[ni] = tmp;
      return arr;
    });
  };

  const applyReorder = async () => {
    try {
      const res = await fetch(`/api/kurs/${courseId}/lektionen/reorder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: localOrder }) });
      if (!res.ok) { alert('Reihenfolge speichern fehlgeschlagen'); return; }
      setCourseLessons(prev => {
        const map = new Map(prev.map(l => [l._id || l.id, l] as const));
        return localOrder.map(id => map.get(id)!).filter(Boolean);
      });
      setReorderMode(false);
    } catch { alert('Netzwerkfehler beim Speichern'); }
  };

  const loadCourseLessons = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/kurs/${courseId}/lektionen`);
      if (response.ok) {
        const data = await response.json();
        let lessons: LessonListItem[] = [];
        if (Array.isArray(data)) lessons = data as LessonListItem[];
        else if (data.success && Array.isArray(data.lessons)) lessons = data.lessons as LessonListItem[];
        setCourseLessons(lessons);
        onLessonsCountChange(lessons.length);
      }
    } catch (e) {
      console.error('Fehler beim Laden der Lektionen:', e);
    } finally {
      setIsLoading(false);
    }
  }, [courseId, onLessonsCountChange]);

  useEffect(() => { void loadCourseLessons(); }, [loadCourseLessons]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Kurs-Lektionen {reorderMode && <span className="text-sm text-blue-600 ml-2">(Reihenfolge bearbeiten)</span>}</h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (!reorderMode) {
                setLocalOrder(courseLessons.map(l => (l._id || l.id) as string).filter(Boolean));
                setReorderMode(true);
              } else {
                setReorderMode(false);
              }
            }}
            className={`px-3 py-1 rounded text-sm border ${reorderMode ? 'bg-yellow-100 border-yellow-300' : 'bg-white hover:bg-gray-50'}`}
          >{reorderMode ? '✖ Abbrechen' : '↕ Reihenfolge'}</button>
          {reorderMode && (
            <button onClick={applyReorder} className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700">💾 Reihenfolge speichern</button>
          )}
          <button onClick={loadCourseLessons} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700" disabled={isLoading}>{isLoading ? '⏳ Laden…' : '🔄 Aktualisieren'}</button>
        </div>
      </div>

      {courseLessons.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <div className="text-4xl mb-4">📚</div>
          <p>Noch keine Lektionen in diesem Kurs.</p>
          <p className="text-sm mt-2">Erstelle deine erste Lektion über "Neue Lektion" oder füge vorhandene Lektionen hinzu.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {(reorderMode ? localOrder.map(id => courseLessons.find(l => (l._id || l.id) === id)!).filter(Boolean) : courseLessons).map((lesson, index) => (
            <div key={lesson._id || lesson.id} className="border rounded p-4 bg-white flex flex-col gap-2">
              {reorderMode && (
                <div className="flex items-center gap-2 text-xs">
                  <button onClick={() => moveLesson((lesson._id || lesson.id) as string, -1)} disabled={index === 0} className={`px-2 py-1 border rounded ${index === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'}`}>↑</button>
                  <button onClick={() => moveLesson((lesson._id || lesson.id) as string, 1)} disabled={index === localOrder.length - 1} className={`px-2 py-1 border rounded ${index === localOrder.length - 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'}`}>↓</button>
                  <span className="font-mono text-gray-500">Pos: {index + 1}</span>
                </div>
              )}
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-4">
                  <div className="bg-blue-100 rounded px-3 py-1 text-sm font-medium text-blue-800">#{index + 1}</div>
                  <div>
                    <h3 className="font-semibold">{lesson.title}</h3>
                    <p className="text-sm text-gray-600 mb-1">
                      {lesson.description || (lesson.questions && `${(lesson.questions as any[]).length} Fragen`) || (lesson.type === 'markdown' ? 'Markdown-Text' : 'Single Choice Quiz')}
                    </p>
                    <div className="flex flex-wrap gap-3 text-sm text-gray-600 items-center">
                      <span>{getLessonTypeIcon(lesson.type)} {getLessonTypeName(lesson.type)}</span>
                      <span>📅 {new Date(lesson.createdAt || (lesson as any).addedAt || Date.now()).toLocaleDateString('de-DE')}</span>
                      {Array.isArray(lesson.questions) && <span>❓ {(lesson.questions as any[]).length} Fragen</span>}
                      <span className="flex items-center gap-1">🏷️ {(lesson as any).category || '–'}</span>
                    </div>
                  </div>
                </div>
                {!reorderMode && (
                  <div className="flex gap-2">
                    <button onClick={() => router.push(inTeacherContext ? `/teacher/lektion/${lesson._id || lesson.id}` : `/autor/lektion/${lesson._id || lesson.id}`)} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">✏️ Bearbeiten</button>
                    <button onClick={() => onDelete(String(lesson._id || lesson.id || ""))} className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700">🗑️ Löschen</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateLessonTab({ courseId, onLessonCreated: _onLessonCreated }: { courseId: string; onLessonCreated?: () => void; }) {
  void _onLessonCreated;
  const pathname = usePathname();
  const inTeacherContext = pathname?.startsWith('/teacher/');
  const templates = [
    { type: 'single-choice', name: '📝 Single Choice Quiz', description: 'Einfache Multiple-Choice Fragen erstellen' },
    { type: 'multiple-choice', name: '❓❓ Multiple Choice', description: 'Mehrere richtige Antworten' },
    { type: 'markdown', name: '🧾 Text', description: 'Informationstext mit Bildern und Links' },
    { type: 'matching', name: '🔗 Paare finden', description: 'Links/Rechts-Paare verbinden (Bild/Audio möglich)' },
    { type: 'video', name: '🎬 Video', description: 'YouTube-Link; Abschluss bei vollständigem Ansehen' },
    { type: 'memory', name: '🧠 Memory', description: 'Paare von Karten (Text/Bild/Audio) finden' },
    { type: 'lueckentext', name: '🧩 Lückentext', description: 'Markdown mit *Antwort*-Lücken (Input oder Drag)' },
    { type: 'ordering', name: '🔢 Reihenfolge', description: 'Schritte/Ereignisse in korrekte Reihenfolge bringen' },
  { type: 'text-answer', name: '✍️ Text-Antwort', description: 'Freitext-Antwort mit Teilantworten & Case-Sensitivity' },
  { type: 'minigame', name: '🎮 Minigame', description: 'Erreiche das Punkteziel – Spieltyp wählbar (Snake, Auto, Flugzeug, PacMan, Space Impact)' }
  ];

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Neue Lektion erstellen</h2>
      <p className="mb-6 text-gray-600">Wähle einen Lektions-Typ:</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((t) => (
          <a
            key={t.type}
            href={inTeacherContext
              ? (t.type === 'single-choice' ? `/teacher/lektion/single-choice?courseId=${courseId}` : `/teacher/lektion/neu?type=${t.type}&courseId=${courseId}`)
              : (t.type === 'single-choice' ? `/autor/lektion/single-choice?courseId=${courseId}` : `/autor/lektion/neu?type=${t.type}&courseId=${courseId}`)
            }
            className="border rounded p-6 hover:bg-blue-50 hover:border-blue-300 transition-colors block"
          >
            <div className="text-3xl mb-3">{getLessonTypeIcon(t.type)}</div>
            <h3 className="font-semibold mb-2">{t.name}</h3>
            <p className="text-gray-600 text-sm">{t.description}</p>
          </a>
        ))}
      </div>
    </div>
  );
}

function ExistingLessonsTab({ courseId, onLessonAdded }: { courseId: string; onLessonAdded?: () => void; }) {
  const [availableLessons, setAvailableLessons] = useState<LessonListItem[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [addedLessons, setAddedLessons] = useState<string[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    const loadGlobalLessons = async () => {
      try {
        const res = await fetch('/api/lessons');
        if (res.ok) {
          const data = await res.json();
          const all: LessonListItem[] = data.lessons || [];
          const filtered = all.filter((l: LessonListItem) => {
            if (l.courseIds && Array.isArray(l.courseIds)) return !l.courseIds.includes(courseId);
            return l.courseId !== courseId;
          });
          setAvailableLessons(filtered);
        }
      } catch (e) {
        console.error('Globale Lektionen laden fehlgeschlagen', e);
      }
    };
    loadGlobalLessons();
  }, [courseId]);

  const handleAddLesson = async (lesson: LessonListItem) => {
    if (!lesson._id) return;
    if (!window.confirm(`Lektion "${lesson.title}" in diesen Kurs kopieren?`)) return;
    setIsAdding(true);
    try {
      const res = await fetch(`/api/kurs/${courseId}/lektionen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceLessonId: lesson._id }) });
      const data = await res.json();
      if (res.ok && data.success) {
        setAddedLessons((a) => [...a, lesson._id as string]);
        onLessonAdded?.();
        toast({ title: 'Lektion kopiert', message: `"${lesson.title}" wurde hinzugefügt.`, kind: 'success' });
      } else {
        const msg = `Fehler: ${data?.error || res.statusText || 'Unbekannt'}`;
        console.error('Copy lesson failed', data);
        toast({ title: 'Kopieren fehlgeschlagen', message: msg, kind: 'error' });
      }
    } catch {
      toast({ title: 'Netzwerkfehler', message: 'Beim Kopieren ist ein Netzwerkfehler aufgetreten.', kind: 'error' });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Vorhandene Lektion kopieren</h2>
      {availableLessons.length === 0 && (
        <div className="text-gray-500 text-sm">Keine anderen Lektionen verfügbar.</div>
      )}
      <div className="space-y-3">
        {availableLessons.map((l) => (
          <div key={l._id || l.id} className="border rounded p-4 bg-white flex justify-between items-start">
            <div>
              <h3 className="font-semibold flex items-center gap-2">{getLessonTypeIcon(l.type)} {l.title}</h3>
              {Array.isArray(l.questions) && <p className="text-xs text-gray-500">{(l.questions as any[]).length} Fragen</p>}
              {l.courseIds && Array.isArray(l.courseIds) && (
                <p className="text-xs text-gray-400">Verwendet in {(l.courseIds?.length) || 1} Kurs(en)</p>
              )}
            </div>
            <div className="flex gap-2">
              <button disabled={isAdding || (l._id ? addedLessons.includes(l._id) : false)} onClick={() => handleAddLesson(l)} className="bg-green-600 disabled:opacity-50 text-white px-3 py-1 rounded text-sm hover:bg-green-700">➕ Kopieren</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getLessonTypeIcon(type: string) {
  switch (type) {
    case 'single-choice': return '📝';
    case 'multiple-choice': return '❓';
    case 'text': return '📖';
    case 'video': return '🎬';
    case 'markdown': return '🧾';
    case 'matching': return '🔗';
    case 'memory': return '🧠';
    case 'lueckentext': return '🧩';
    case 'ordering': return '🔢';
    case 'text-answer': return '✍️';
  case 'minigame': return '🎮';
    default: return '📦';
  }
}

function getLessonTypeName(type: string) {
  switch (type) {
    case 'single-choice': return 'Single Choice';
    case 'multiple-choice': return 'Multiple Choice';
    case 'text': return 'Text';
    case 'video': return 'Video';
    case 'markdown': return 'Markdown-Text';
    case 'matching': return 'Paare finden';
    case 'memory': return 'Memory';
    case 'lueckentext': return 'Lückentext';
    case 'ordering': return 'Reihenfolge';
    case 'text-answer': return 'Text-Antwort';
  case 'minigame': return 'Minigame';
    default: return type;
  }
}
