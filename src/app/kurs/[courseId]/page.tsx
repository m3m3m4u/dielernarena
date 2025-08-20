"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from 'next-auth/react';
import { useParams, useSearchParams } from "next/navigation";
import CourseContextSwitcher from '@/components/CourseContextSwitcher';

interface LessonDoc {
  _id?: string;
  id?: string;
  title: string;
  type: string;
  description?: string;
  createdAt?: string;
  addedAt?: string;
  questions?: Array<unknown>;
  content?: { questions?: Array<unknown> };
}
interface CourseDoc {
  _id: string;
  title: string;
  description?: string;
  category?: string;
  createdAt?: string;
  isPublished?: boolean;
}

export default function KursAnsichtPage() {
  const params = useParams();
  const courseId = params.courseId as string;
  const { data: session } = useSession();
  const search = useSearchParams();
  const [isGuest, setIsGuest] = useState(false);
  useEffect(()=>{ try{ setIsGuest((search?.get('guest')==='1') || (typeof window!=='undefined' && localStorage.getItem('guest:active')==='1')); } catch{ setIsGuest(false); } },[search]);
  
  const [course, setCourse] = useState<CourseDoc | null>(null);
  const [lessons, setLessons] = useState<LessonDoc[]>([]);
  const [completedLessonIds, setCompletedLessonIds] = useState<string[]>([]);
  const [inProgressLessonIds, setInProgressLessonIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCourse = useCallback(async () => {
    try {
      // Lade echte Kursdaten aus MongoDB
      const response = await fetch(`/api/kurs/${courseId}`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.success) {
          setCourse(data.course as CourseDoc);
          
          // Lektionen sind bereits in der Antwort enthalten
          if (data.lessons) {
            setLessons(data.lessons as LessonDoc[]);
          } else {
            setLessons([]);
          }
        } else {
          console.error('Kurs nicht gefunden');
          setCourse(null);
          setLessons([]);
        }
      } else {
        console.error('Fehler beim Laden des Kurses');
        setCourse(null);
        setLessons([]);
      }
    } catch (error) {
      console.error("Fehler beim Laden des Kurses:", error);
      setCourse(null);
      setLessons([]);
    } finally {
      setLoading(false);
      // completed aus localStorage laden
      try {
        const key = `course:${courseId}:completedLessons`;
        const inProgKey = `course:${courseId}:inProgressLessons`;
        const stored = JSON.parse(localStorage.getItem(key) || '[]');
        const merged = Array.from(new Set([...(stored||[])]));
        if (merged.length !== stored.length) {
          localStorage.setItem(key, JSON.stringify(merged));
        }
        if (Array.isArray(merged)) setCompletedLessonIds(merged as string[]);
        const storedProg = JSON.parse(localStorage.getItem(inProgKey) || '[]');
        if (Array.isArray(storedProg)) setInProgressLessonIds((storedProg as string[]).filter((id)=> !(merged as string[]).includes(id)));
      } catch {}
    }
  }, [courseId]);

  useEffect(() => {
    void loadCourse();
  }, [loadCourse]);

  useEffect(() => {
    // merge globale completedLessons (vom Server) mit kursbezogenen IDs
    if (!lessons || lessons.length === 0) return;
    try {
      const lessonIds: string[] = lessons.map((l) => (l._id || l.id) as string).filter(Boolean);
      const key = `course:${courseId}:completedLessons`;
      const inProgKey = `course:${courseId}:inProgressLessons`;
      const localCompleted: string[] = JSON.parse(localStorage.getItem(key) || '[]');
      const globalCompleted: string[] = JSON.parse(localStorage.getItem('global:completedLessons') || '[]');
      const merged = Array.from(new Set([
        ...(Array.isArray(localCompleted) ? localCompleted : []),
        ...(Array.isArray(globalCompleted) ? globalCompleted.filter(id => lessonIds.includes(id)) : [])
      ]));
      localStorage.setItem(key, JSON.stringify(merged));
      setCompletedLessonIds(merged);
      const storedProg: string[] = JSON.parse(localStorage.getItem(inProgKey) || '[]');
      setInProgressLessonIds(Array.isArray(storedProg) ? storedProg.filter(id => !merged.includes(id)) : []);
    } catch {}
  }, [lessons, courseId]);

  const getLessonTypeIcon = (type: string) => {
    const icons: { [key: string]: string } = {
      'text': '📖',
      'markdown': '🧾',
      'quiz': '❓',
      'single-choice': '📝',
      'multiple-choice': '❓❓',
      'video': '🎥',
      'exercise': '✏️'
    };
    return icons[type] || '📄';
  };

  const getLessonTypeName = (type: string) => {
    const names: { [key: string]: string } = {
      'text': 'Text-Lektion',
      'markdown': 'Text',
      'quiz': 'Quiz',
      'single-choice': 'Single Choice',
      'multiple-choice': 'Multiple Choice',
      'video': 'Video',
      'exercise': 'Übung'
    };
    return names[type] || 'Lektion';
  };

  const resetLessonProgress = async (lessonId: string) => {
    try {
      const completedKey = `course:${courseId}:completedLessons`;
      const inProgKey = `course:${courseId}:inProgressLessons`;
      const completed = JSON.parse(localStorage.getItem(completedKey) || '[]');
      const inProg = JSON.parse(localStorage.getItem(inProgKey) || '[]');
      const newCompleted = Array.isArray(completed) ? completed.filter((id: string) => id !== lessonId) : [];
      const newInProg = Array.isArray(inProg) ? inProg.filter((id: string) => id !== lessonId) : [];
      localStorage.setItem(completedKey, JSON.stringify(newCompleted));
      localStorage.setItem(inProgKey, JSON.stringify(newInProg));
      setCompletedLessonIds(newCompleted);
      setInProgressLessonIds(newInProg);
      const username = session?.user?.username as string | undefined;
      if (username) {
        // Server Reset (idempotent)
        fetch('/api/lesson/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, lessonId })
        }).catch(()=>{});
      }
    } catch (e) {
      console.warn('Neu starten fehlgeschlagen', e);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto mt-10 p-6 text-center">
        <div className="text-4xl mb-4">⏳</div>
        <p>Lade Kurs...</p>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="max-w-6xl mx-auto mt-10 p-6 text-center">
        <div className="text-4xl mb-4">❌</div>
        <h1 className="text-2xl font-bold mb-4">Kurs nicht gefunden</h1>
        <p className="text-gray-600 mb-6">Der angeforderte Kurs konnte nicht geladen werden.</p>
        <a href="/lernen" className="bg-blue-600 text-white px-6 py-3 rounded hover:bg-blue-700">
          Zur Kursübersicht
        </a>
      </div>
    );
  }

  return (
    <main className="max-w-6xl mx-auto mt-10 p-6">
  <CourseContextSwitcher currentCourseId={course._id} currentCourseTitle={course.title} />
      {/* Navigation */}
      <div className="mb-6">
        <a href="/lernen" className="text-blue-600 hover:underline">← Zurück zur Kursübersicht</a>
      </div>

      {/* Gast Hinweis */}
      {isGuest && (
        <div className="mb-4 text-xs text-yellow-800 bg-yellow-50 border border-yellow-300 rounded p-2">Gastmodus aktiv: Fortschritte werden nur lokal im Browser gespeichert.</div>
      )}
      {/* Kurs Header */}
      <div className="bg-white border rounded p-6 mb-6">
        <h1 className="text-3xl font-bold mb-4">{course.title}</h1>
        <p className="text-gray-600 mb-4 text-lg">{course.description}</p>
        
        <div className="flex gap-6 text-sm text-gray-500 mb-4">
          <span>📚 {course.category}</span>
          <span> {course.createdAt ? new Date(course.createdAt).toLocaleDateString('de-DE') : ''}</span>
        </div>

        <div className="flex gap-4">
          <div className="bg-green-100 text-green-800 px-3 py-1 rounded text-sm font-medium">
            {course.isPublished ? '✅ Veröffentlicht' : '📝 Entwurf'}
          </div>
          <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded text-sm font-medium">
            📚 {lessons.length} Lektionen
          </div>
        </div>
      </div>

      {/* Lektionen Liste */}
      <div className="bg-white border rounded">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold">📚 Kurs-Inhalte</h2>
          <p className="text-gray-600 text-sm mt-1">
            {lessons.length} Lektionen in diesem Kurs
          </p>
        </div>

        <div className="p-6">
          {lessons.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-4">📚</div>
              <p>Noch keine Lektionen verfügbar.</p>
              <p className="text-sm mt-2">Dieser Kurs wird noch bearbeitet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {lessons.map((lesson, index) => (
                <div key={lesson._id || lesson.id} className="border rounded p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="flex items-start gap-4">
                      <div className="bg-blue-100 rounded px-3 py-1 text-sm font-medium text-blue-800 flex-shrink-0">
                        #{index + 1}
                      </div>
                      <div className="flex-grow">
                        <h3 className="font-semibold mb-1">{lesson.title}</h3>
                        <p className="text-sm text-gray-600 mb-2">
                          {lesson.description || 
                           (lesson.questions && (lesson.type === 'single-choice' || lesson.type === 'multiple-choice') && `${lesson.questions.length} Fragen`) || 
                           (lesson.content?.questions && `${lesson.content.questions.length} Fragen`) ||
                           (lesson.type === 'markdown' ? 'Text' : 'Lektion')}
                        </p>
                        <div className="flex gap-3 text-sm text-gray-500">
                          <span>{getLessonTypeIcon(lesson.type)} {getLessonTypeName(lesson.type)}</span>
                          <span>📅 {new Date((lesson.createdAt || lesson.addedAt) as string).toLocaleDateString('de-DE')}</span>
                          {lesson.questions && (lesson.type === 'single-choice' || lesson.type === 'multiple-choice') && (
                            <span>❓ {lesson.questions.length} Fragen</span>
                          )}
                          {lesson.content?.questions && (
                            <span>❓ {lesson.content.questions.length} Fragen</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {completedLessonIds.includes((lesson._id || lesson.id) as string) && (
                        <span className="text-green-600 text-sm font-semibold flex items-center gap-1">
                          ✓ {lesson.type !== 'markdown' ? <span className="text-yellow-400">★</span> : null}
                        </span>
                      )}
                      <a
                        href={`/kurs/${courseId}/lektion/${lesson._id || lesson.id}`}
                        className={`px-4 py-2 rounded text-sm font-medium text-white ${completedLessonIds.includes((lesson._id || lesson.id) as string) ? 'bg-green-600 hover:bg-green-700' : inProgressLessonIds.includes((lesson._id || lesson.id) as string) ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                      >
                        {completedLessonIds.includes((lesson._id || lesson.id) as string) ? '✅ Abgeschlossen' : inProgressLessonIds.includes((lesson._id || lesson.id) as string) ? '⏩ Weitermachen' : '▶️ Starten'}
                      </a>
                      {(completedLessonIds.includes((lesson._id || lesson.id) as string) || inProgressLessonIds.includes((lesson._id || lesson.id) as string)) && (
                        <button
                          type="button"
                          onClick={() => resetLessonProgress((lesson._id || lesson.id) as string)}
                          className="px-3 py-2 rounded text-xs font-medium border border-gray-300 bg-white text-gray-600 hover:bg-gray-100"
                          title="Fortschritt für diese Lektion lokal zurücksetzen"
                        >
                          🔄 Neu starten
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Kurs Footer */}
      <div className="mt-6 bg-gray-50 border rounded p-6 text-center">
        <h3 className="font-semibold mb-2">📈 Kurs-Fortschritt</h3>
        <p className="text-gray-600 text-sm mb-4">
          Du kannst jede Lektion in beliebiger Reihenfolge bearbeiten
        </p>
        <div className="text-2xl font-bold text-blue-600">
          {completedLessonIds.length} / {lessons.length} Lektionen abgeschlossen
        </div>
      </div>
    </main>
  );
}
