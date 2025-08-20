"use client";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from 'next/navigation';

type ClassCourse = {
  course: { _id: string; title: string; description?: string };
  mode?: "link" | "copy";
  accessId?: string;
};

type TeacherClass = { _id: string; name: string; courses?: ClassCourse[] };

interface Props {
  currentCourseId: string;
  currentCourseTitle?: string;
}

export default function CourseContextSwitcher({ currentCourseId, currentCourseTitle }: Props){
  const { data: session } = useSession();
  const search = useSearchParams();
  const router = useRouter();
  const role = (session?.user as any)?.role as string | undefined;
  const isTeacher = role === 'teacher';
  const isAdmin = role === 'admin';
  const isLearner = role === 'learner';

  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [learnerClassName, setLearnerClassName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!isTeacher) return; // nur Teacher hat API
      setLoading(true); setError(null);
      try {
        const res = await fetch('/api/teacher/courses/manage');
        const d = await res.json().catch(()=>({}));
        if (cancelled) return;
        if (res.ok && d?.success) {
          const cls = (d.classes || []) as TeacherClass[];
          setClasses(cls);
          const fromQuery = search?.get('classId') || '';
          setSelectedClassId((fromQuery && cls.find(c=>String(c._id)===String(fromQuery))? fromQuery : (cls[0]?._id) || ""));
        } else {
          setError(d?.error || 'Fehler beim Laden der Klassen');
          setClasses([]);
        }
      } catch (e) {
        if (!cancelled) { setError('Netzwerkfehler'); setClasses([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isTeacher]);

  // Lernende: Klassennamen laden
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!isLearner) return;
      try{
        const res = await fetch('/api/class/me');
        const d = await res.json().catch(()=>({}));
        if (cancelled) return;
        if (res.ok && d?.success && d?.class?.name) setLearnerClassName(String(d.class.name));
      } catch {}
    };
    load();
    return () => { cancelled = true; };
  }, [isLearner]);

  const selectedClass = useMemo(() => classes.find(c => String(c._id) === String(selectedClassId)), [classes, selectedClassId]);

  const matchInSelected = useMemo(() => {
    if (!selectedClass) return undefined;
    const byId = selectedClass.courses?.find(cc => String(cc.course._id) === String(currentCourseId));
    if (byId) return byId;
    if (currentCourseTitle) {
      const byTitle = selectedClass.courses?.find(cc => String(cc.course.title).trim() === String(currentCourseTitle).trim());
      return byTitle;
    }
    return undefined;
  }, [selectedClass, currentCourseId, currentCourseTitle]);

  // Anzeigenlogik je Rolle
  if (isLearner) {
    // Lernende: zeigen nur Label, kein Schalter (Policy: nur klassenbasierter Zugriff)
    return (
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-gray-600 flex items-center gap-2">
          <span className="px-2 py-1 rounded border bg-white">Allgemeiner Bereich</span>
          <span className="text-gray-400">|</span>
          <span className="px-2 py-1 rounded border bg-gray-100" title="Deine Klasse">Klassenbereich</span>
        </div>
  <div className="text-xs text-gray-500">{learnerClassName ? `Deine Klasse: ${learnerClassName}` : 'Dein Fortschritt gilt in deiner Klasse'}</div>
      </div>
    );
  }

  if (isAdmin) {
    // Admin: nur kosmetischer Hinweis
    return (
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-gray-600">
          <span className="px-2 py-1 rounded border bg-blue-600 text-white">Allgemeiner Bereich</span>
          <span className="ml-2 px-2 py-1 rounded border bg-gray-100 text-gray-600">Klassenbereich</span>
        </div>
        <div className="text-xs text-gray-500">Admin-Ansicht</div>
      </div>
    );
  }

  if (isTeacher) {
    return (
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <span className="px-2 py-1 rounded border bg-blue-600 text-white">Allgemeiner Bereich</span>
          <span className="px-2 py-1 rounded border bg-white">Klassenspezifisch</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-gray-600">Klasse:</label>
          <select className="border rounded px-2 py-1" value={selectedClassId} onChange={(e)=> { const v=e.target.value; setSelectedClassId(v); const q=new URLSearchParams(Array.from(search?.entries?.()||[])); if(v) q.set('classId', v); else q.delete('classId'); router.replace(`?${q.toString()}`); }}>
            {classes.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
          {loading && <span className="text-xs text-gray-500">Lade…</span>}
        </div>
        {selectedClass && (
          <div className="w-full text-xs text-gray-600">
            {matchInSelected ? (
              <div>
                <span className="text-green-700 font-medium">In dieser Klasse freigeschaltet</span>
                {matchInSelected.mode && (
                  <span className="ml-2 px-2 py-0.5 rounded bg-green-100 text-green-800 uppercase tracking-wide">{matchInSelected.mode === 'copy' ? 'Kopie' : 'Link'}</span>
                )}
                {String(matchInSelected.course._id) !== String(currentCourseId) && (
                  <a className="ml-3 text-blue-600 hover:underline" href={`/kurs/${matchInSelected.course._id}`}>Zum Klassenkurs wechseln →</a>
                )}
              </div>
            ) : (
              <div className="text-amber-700">
                Nicht für diese Klasse freigeschaltet
              </div>
            )}
          </div>
        )}
        {error && <div className="w-full text-xs text-red-600">{error}</div>}
      </div>
    );
  }

  // Fallback
  return null;
}
