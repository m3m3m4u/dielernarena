"use client";
import { useState, useEffect } from "react";
import CategorySelect from '@/components/shared/CategorySelect';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import MediaLibrary from '@/components/media/MediaLibrary';

interface CourseDB { _id: string; title: string; description?: string; category?: string; isPublished?: boolean; }
interface CourseUI { id: string; title: string; description?: string; category?: string; status: string; lessons: number; }
interface LessonLite { _id: string; title: string; type: string; isExercise?: boolean; category?: string; courseId?: string; createdAt?: string; }

export default function AutorPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const canUpload = role === 'author' || role === 'admin';
  const initialTab = (()=>{
    const t = searchParams?.get('tab');
    return (t==='uebungen'||t==='neu'||t==='kurse'||t==='medien') ? t : 'kurse';
  })();
  const [tab, setTab] = useState<'kurse'|'neu'|'uebungen'|'medien'>(initialTab as any);

  // Hilfsfunktion: Tab wechseln UND URL (Query) aktualisieren, damit Refresh / Direktlink funktioniert
  function changeTab(next: 'kurse'|'neu'|'uebungen'|'medien') {
    setTab(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', next);
      // Router ersetzen statt push um History-Spam zu vermeiden
      router.replace(url.pathname + '?' + url.searchParams.toString());
      // Merken für andere Seiten (Back-Link Logik)
      localStorage.setItem('lastAuthorTab', next === 'uebungen' ? 'uebungen' : (next==='medien'?'medien':'kurse'));
    } catch { /* ignore */ }
  }
  return (
    <main className="max-w-6xl mx-auto mt-10 p-6">
      <h1 className="text-3xl font-bold mb-6">✍️ Autorentool</h1>
      <p className="mb-6 text-gray-700">Direkte Übungserstellung entfernt – nur Kurse & Markierung vorhandener Lektionen als Übungen.</p>
      <div className="flex gap-6 border-b border-gray-200 mb-8 text-sm">
        <button onClick={()=>changeTab('kurse')} className={"pb-2 -mb-px border-b-2 "+(tab==='kurse'?'border-blue-600 font-semibold text-blue-700':'border-transparent text-gray-500 hover:text-gray-800')}>Kurse</button>
        <button onClick={()=>changeTab('neu')} className={"pb-2 -mb-px border-b-2 "+(tab==='neu'?'border-blue-600 font-semibold text-blue-700':'border-transparent text-gray-500 hover:text-gray-800')}>Neuer Kurs</button>
        <button onClick={()=>changeTab('uebungen')} className={"pb-2 -mb-px border-b-2 "+(tab==='uebungen'?'border-blue-600 font-semibold text-blue-700':'border-transparent text-gray-500 hover:text-gray-800')}>Übungen</button>
        <button onClick={()=>changeTab('medien')} className={"pb-2 -mb-px border-b-2 "+(tab==='medien'?'border-blue-600 font-semibold text-blue-700':'border-transparent text-gray-500 hover:text-gray-800')}>Medien</button>
      </div>
      {tab==='kurse' && <CoursesTab />}
      {tab==='neu' && <CreateCourseTab />}
      {tab==='uebungen' && <ExercisesTab />}
      {tab==='medien' && (
        <section>
          <MediaLibrary canUpload={!!canUpload} />
        </section>
      )}
    </main>
  );
}

// -------- Kurse Liste --------
function CoursesTab() {
    const [courses, setCourses] = useState<CourseUI[]>([]);
    const [loading, setLoading] = useState(false);

    async function load() {
      setLoading(true);
      try {
  // Autoren sollen auch Entwürfe sehen -> showAll=1
  const res = await fetch('/api/kurse?showAll=1');
        const data = await res.json();
        if (res.ok && data.success && Array.isArray(data.courses)) {
          const dbCourses: CourseDB[] = data.courses;
          const lessonCounts = await Promise.all(dbCourses.map(async c => {
            try {
              const lr = await fetch(`/api/kurs/${c._id}/lektionen`);
              const ld = await lr.json();
              return Array.isArray(ld.lessons) ? ld.lessons.length : 0;
            } catch { return 0; }
          }));
          setCourses(dbCourses.map((c,i)=>({ id:c._id, title:c.title, description:c.description, category:c.category, status:c.isPublished?'Veröffentlicht':'Entwurf', lessons: lessonCounts[i]||0 })));
        } else { setCourses([]); }
      } catch { setCourses([]); }
      setLoading(false);
    }

    useEffect(()=>{ load(); }, []);

    async function del(courseId: string, title: string) {
      if (!confirm(`Kurs "${title}" wirklich löschen?`)) return;
      try {
        const res = await fetch(`/api/kurs/${courseId}`, { method:'DELETE' });
        const data = await res.json();
        if (!res.ok) alert(data.error || 'Fehler');
        load();
      } catch { alert('Netzwerkfehler'); }
    }

    return (
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Vorhandene Kurse</h2>
          <button onClick={load} disabled={loading} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50">{loading?'⏳':'🔄'}</button>
        </div>
        {loading && <div className="text-sm text-gray-500 py-8">Lade Kurse…</div>}
        {!loading && courses.length===0 && <div className="text-sm text-gray-500 py-6">Keine Kurse gefunden.</div>}
        <div className="grid gap-4">
          {courses.map(c=> (
            <div key={c.id} className="bg-white border rounded p-4 flex justify-between items-center">
              <div>
                <h3 className="font-semibold">{c.title}</h3>
                <p className="text-xs text-gray-600">{c.lessons} Lektionen • {c.status}</p>
                {c.description && <p className="text-xs text-gray-500 mt-1">{c.description}</p>}
                {c.category && <span className="inline-block mt-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">{c.category}</span>}
              </div>
              <div className="flex flex-col gap-2 text-sm min-w-[10rem]">
                <a href={`/autor/kurs/${c.id}/einstellungen`} className="flex items-center justify-center gap-1 bg-gray-600 text-white px-3 py-1.5 rounded hover:bg-gray-700"><span>⚙️</span><span>Einstellungen</span></a>
                <a href={`/autor/kurs/${c.id}`} className="flex items-center justify-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"><span>📝</span><span>Bearbeiten</span></a>
                <button onClick={()=>del(c.id, c.title)} className="flex items-center justify-center gap-1 bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700"><span>🗑️</span><span>Löschen</span></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

// -------- Kurs erstellen --------
function CreateCourseTab() {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');
    const [busy, setBusy] = useState(false);

    async function submit(e: React.FormEvent) {
      e.preventDefault(); if (!title || !description || !category) return; setBusy(true);
      try {
        const res = await fetch('/api/kurse', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title, description, category }) });
        const data = await res.json();
        if (res.ok && data.success) { window.location.href = `/autor/kurs/${data.courseId}`; }
        else alert(data.error || 'Fehler');
      } catch { alert('Netzwerkfehler'); }
      setBusy(false);
    }

    return (
      <form onSubmit={submit} className="space-y-6 max-w-2xl">
        <div>
          <label className="block text-sm font-medium mb-1">Titel *</label>
          <input value={title} onChange={e=>setTitle(e.target.value)} required className="w-full border rounded p-3" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Beschreibung *</label>
          <textarea value={description} onChange={e=>setDescription(e.target.value)} required className="w-full border rounded p-3 h-28" />
        </div>
        <div>
          <CategorySelect
            value={category}
            onChange={setCategory}
            label="Kategorie *"
            required
            includeEmpty
            emptyLabel="Kategorie wählen"
            selectClassName="w-full border rounded p-3"
          />
        </div>
        <div>
          <button disabled={busy} className="bg-green-600 disabled:opacity-50 text-white px-6 py-3 rounded font-semibold hover:bg-green-700">{busy?'Erstelle…':'Kurs erstellen ➜'}</button>
        </div>
      </form>
    );
  }

// -------- Übungen (nur Markierung & Edit) --------
function ExercisesTab() {
    const [lessons, setLessons] = useState<LessonLite[]>([]);
    const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
    const [markingId, setMarkingId] = useState<string|null>(null);
    const [editingId, setEditingId] = useState<string|null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editRaw, setEditRaw] = useState('');
    const [editMarkdown, setEditMarkdown] = useState('');
    const [saving, setSaving] = useState(false);
  const [courseTitles, setCourseTitles] = useState<Record<string,string>>({});
  const [onlyMarked, setOnlyMarked] = useState(false);

  async function load() {
      setLoading(true);
      try {
        const res = await fetch('/api/lessons');
        const data = await res.json();
    const arr = Array.isArray(data.lessons) ? data.lessons : [];
    // Sortierung: neueste zuerst (Fallback createdAt, sonst _id Timestamp Schätzung nicht implementiert)
    arr.sort((a: any,b: any)=> new Date(b.createdAt||0).getTime() - new Date(a.createdAt||0).getTime());
    setLessons(arr as LessonLite[]);
        // Kurs-Titel nachladen (nur für Lektionen mit Kursbindung != exercise-pool)
  const uniqueCourseIds: string[] = Array.from(new Set((arr as any[]).map(l=> String(l.courseId||'')).filter(id=> id && id !== 'exercise-pool')));
        if (uniqueCourseIds.length){
          // Parallel holen
          Promise.all(uniqueCourseIds.map(async id => {
            if (courseTitles[id]) return { id, title: courseTitles[id] }; // schon vorhanden
            try {
              const r = await fetch(`/api/kurs/${id}`);
              if(!r.ok) return null;
              const d = await r.json();
              const t = d?.course?.title || id;
              return { id, title: t as string };
            } catch { return null; }
          })).then(results => {
            const patch: Record<string,string> = {};
            results.filter(Boolean).forEach((r:any)=>{ patch[r.id]=r.title; });
            if (Object.keys(patch).length) setCourseTitles(prev=>({...prev,...patch}));
          });
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    useEffect(()=>{ load(); }, []);

    async function mark(lessonId: string) {
      setMarkingId(lessonId);
      try {
        const res = await fetch('/api/exercises', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ lessonId }) });
        const data = await res.json();
        if (res.ok && data.success) {
          const cat = data.exercise?.category;
          setLessons(prev=>prev.map(l=>l._id===lessonId?{...l,isExercise:true, category: l.category || cat}:l));
        }
        else alert(data.error||'Fehler');
      } catch { alert('Netzwerkfehler'); }
      setMarkingId(null);
    }

    async function startEdit(lessonId: string) {
      setEditingId(lessonId); setSaving(false);
      try {
        const res = await fetch(`/api/exercises?lessonId=${lessonId}`);
        const data = await res.json();
        if (res.ok && data.success) {
          const l = data.exercise;
          setEditTitle(l.title);
          if (l.type==='markdown') { setEditMarkdown(l.content?.markdown||''); setEditRaw(''); }
          else if (Array.isArray(l.questions) && l.questions.length) {
            const raw = l.questions.map((q:any)=>{
                const answers = q.answers || q.allAnswers || [];
                // erste Antwort soll korrekt sein -> falls nicht, sortieren
                let ordered = answers.slice();
                const firstCorrect = q.correctAnswer || (Array.isArray(q.correctAnswers)? q.correctAnswers[0]: undefined);
                if(firstCorrect && ordered[0] !== firstCorrect){
                  ordered = [firstCorrect, ...ordered.filter((a:string)=>a!==firstCorrect)];
                }
                return [q.question, ...ordered].join('\n');
              }).join('\n\n');
            setEditRaw(raw); setEditMarkdown('');
          } else { setEditRaw(''); setEditMarkdown(JSON.stringify(l.content||{},null,2)); }
        } else { alert('Fehler beim Laden'); setEditingId(null); }
      } catch { alert('Netzwerkfehler'); setEditingId(null); }
    }

    function parseQA(raw: string){
      return raw.split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean).map(block=>{
        const lines = block.split(/\n/).map(l=>l.trim()).filter(Boolean);
        const q = lines[0]||''; const answers = lines.slice(1).map(a=>a.replace(/^\*/,'').trim());
        if(!answers.length) return null;
        const correctAnswer = answers[0];
        return { question:q, answers, correct:[correctAnswer], correctAnswer };
      }).filter((x:any)=>x && x.question && x.answers.length>0) as any[];
    }

    async function save(){
      if(!editingId) return; setSaving(true);
      try {
        const lesson = lessons.find(l=>l._id===editingId);
        let patch:any = { lessonId: editingId, title: editTitle };
        if (lesson?.type==='markdown') patch.content = { markdown: editMarkdown };
        else if (lesson?.type==='single-choice' || lesson?.type==='multiple-choice') {
          const parsed = parseQA(editRaw); if (!parsed.length){ alert('Keine Fragen geparst'); setSaving(false); return; }
          patch.questions = parsed.map(q=>({ question:q.question, answers:q.answers, ...(lesson.type==='single-choice'?{correctAnswer:q.correctAnswer}:{correctAnswers:q.correct}) }));
        } else patch.content = { raw: editRaw };
        const res = await fetch('/api/exercises', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(patch) });
        const data = await res.json();
        if (res.ok && data.success) { setLessons(prev=>prev.map(l=>l._id===editingId?{...l,title:editTitle}:l)); cancel(); }
        else alert(data.error||'Fehler');
      } catch { alert('Netzwerkfehler'); }
      setSaving(false);
    }

    async function unmark(lessonId:string, hard?:boolean){
      if(!confirm(hard?'Übung endgültig löschen?':'Übung-Markierung entfernen?')) return;
      try {
        const res = await fetch(`/api/exercises?lessonId=${lessonId}${hard?'&delete=1':''}`, { method:'DELETE' });
        const data = await res.json();
        if(res.ok && data.success){
          if(hard && data.deleted) setLessons(prev=>prev.filter(l=>l._id!==lessonId));
          else setLessons(prev=>prev.map(l=>l._id===lessonId?{...l,isExercise:false}:l));
        } else {
          if(res.status===409 && data.courseId){
            alert(`${data.error}\nKurs: ${data.courseTitle||data.courseId}`);
          } else {
            alert(data.error||'Fehler');
          }
        }
      } catch { alert('Netzwerkfehler'); }
    }

    async function deleteStandalone(lesson: LessonLite){
      if(!confirm('Lektion wirklich löschen?')) return;
      // Wenn Lektion an Kurs gebunden ist -> ablehnen und Kurs nennen
      if(lesson.courseId && lesson.courseId !== 'exercise-pool'){
        try {
          const r = await fetch(`/api/kurs/${lesson.courseId}`);
          if(r.ok){
            const d = await r.json();
            const title = d?.course?.title || lesson.courseId;
            alert(`Löschen nicht möglich – Lektion gehört zum Kurs: ${title}`);
          } else {
            alert(`Löschen nicht möglich – Lektion gehört zu Kurs ${lesson.courseId}`);
          }
        } catch {
          alert(`Löschen nicht möglich – Kurs ${lesson.courseId}`);
        }
        return;
      }
      try {
        const res = await fetch(`/api/lessons/${lesson._id}`, { method:'DELETE' });
        if(!res.ok){
          const data = await res.json().catch(()=>({}));
          alert(data.error||'Fehler beim Löschen');
          return;
        }
        setLessons(prev=>prev.filter(l=>l._id!==lesson._id));
      } catch {
        alert('Netzwerkfehler');
      }
    }

    function cancel(){ setEditingId(null); setEditTitle(''); setEditRaw(''); setEditMarkdown(''); }

    const filtered = lessons.filter(l=>{
      if (filter && !l.title.toLowerCase().includes(filter.toLowerCase())) return false;
      if (categoryFilter && l.category !== categoryFilter) return false;
      if (onlyMarked && !l.isExercise) return false;
      return true;
    });

  // Pagination
  const pageSize = 10;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  if (page > totalPages && totalPages>0) { setPage(totalPages); }
  useEffect(()=>{ setPage(1); }, [filter, categoryFilter, onlyMarked]);
  const startIndex = (page-1)*pageSize;
  const paginated = filtered.slice(startIndex, startIndex + pageSize);

    const templates = [
      { type:'single-choice', icon:'📝', name:'Single Choice', desc:'Eine richtige Antwort' },
      { type:'multiple-choice', icon:'❓❓', name:'Multiple Choice', desc:'Mehrere richtige Antworten' },
      { type:'markdown', icon:'🧾', name:'Markdown', desc:'Freier Inhalt' },
      { type:'matching', icon:'🔗', name:'Matching', desc:'Paare verbinden' },
      { type:'memory', icon:'🧠', name:'Memory', desc:'Paare aufdecken' },
      { type:'lueckentext', icon:'🧩', name:'Lückentext', desc:'*Antwort* markieren' },
      { type:'ordering', icon:'🔢', name:'Reihenfolge', desc:'Sortieren' },
      { type:'text-answer', icon:'✍️', name:'Text-Antwort', desc:'Freitext prüfen' },
  { type:'minigame', icon:'🎮', name:'Minigame', desc:'Kursteilnehmer wählen den Spieltyp.' },
  { type:'video', icon:'🎬', name:'Video', desc:'YouTube (Embed) – abgeschlossen nach komplettem Ansehen' }
    ];

    const goCreate = (t:string) => {
      // Kurs-Kontext erforderlich? Nutzer wird auf Seite ggf. erinnert.
      window.location.href = `/autor/lektion/neu?type=${encodeURIComponent(t)}`;
    };

    return (
      <div className="space-y-8">
        <div>
          <h3 className="text-lg font-semibold mb-3">Neue Lektion / Übung erstellen</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-2">
            {templates.map(t => (
              <button
                key={t.type}
                type="button"
                onClick={()=>goCreate(t.type)}
                className="border rounded p-4 text-left bg-white hover:border-blue-400 hover:bg-blue-50 transition focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <div className="text-2xl mb-2">{t.icon}</div>
                <div className="font-semibold text-sm mb-1">{t.name}</div>
                <div className="text-xs text-gray-600 leading-snug">{t.desc}</div>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-500">Hinweis: Einige Typen (z.B. Single Choice) besitzen einen speziellen Editor.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter Titel..." className="border rounded px-3 py-1 text-sm" />
          <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)} className="border rounded px-2 py-1 text-sm">
            <option value="">Alle Fächer</option>
            {Array.from(new Set(lessons.map(l=>l.category).filter(Boolean)))
              .sort()
              .map(cat=> <option key={cat as string} value={cat as string}>{cat}</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs border rounded px-2 py-1 cursor-pointer select-none bg-white">
            <input type="checkbox" className="accent-blue-600" checked={onlyMarked} onChange={e=>setOnlyMarked(e.target.checked)} />
            Nur markierte
          </label>
          <button onClick={load} className="text-sm px-3 py-1 border rounded hover:bg-gray-50">🔄 Aktualisieren</button>
          {categoryFilter && <button type="button" onClick={()=>setCategoryFilter('')} className="text-xs text-blue-600 underline">Filter zurücksetzen</button>}
        </div>
        {(categoryFilter || filter) && (
          <div className="text-[11px] text-gray-500">Gefunden: {filtered.length} / {lessons.length}</div>
        )}
        {loading && <div className="text-sm text-gray-500">Lade Lektionen…</div>}
        {!loading && filtered.length===0 && <div className="text-sm text-gray-500">Keine Lektionen gefunden.</div>}
        <div className="border rounded divide-y">
          {paginated.map(lesson=> (
            <div key={lesson._id} className="p-3 flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{lesson.title}</div>
                <div className="text-xs text-gray-500 flex gap-2 flex-wrap">
                  <span>Typ: {lesson.type}</span>
                  {lesson.category && <span className="text-blue-600">Fach: {lesson.category}</span>}
                  {lesson.courseId && lesson.courseId !== 'exercise-pool' && (
                    <span className="text-purple-600">Kurs: {courseTitles[lesson.courseId] || '…'}</span>
                  )}
                </div>
              </div>
              {editingId===lesson._id ? (
                <div className="flex-1 space-y-2">
                  <input value={editTitle} onChange={e=>setEditTitle(e.target.value)} className="border rounded px-2 py-1 w-full text-sm" />
                  {lesson.type==='markdown' ? (
                    <textarea value={editMarkdown} onChange={e=>setEditMarkdown(e.target.value)} className="border rounded px-2 py-1 w-full text-xs h-32 font-mono" />
                  ): (
                    <textarea value={editRaw} onChange={e=>setEditRaw(e.target.value)} className="border rounded px-2 py-1 w-full text-xs h-32 font-mono" />
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <button disabled={saving} onClick={save} className="bg-blue-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50">💾 Speichern</button>
                    <button onClick={cancel} className="bg-gray-500 text-white px-3 py-1 rounded text-sm">Abbrechen</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 flex-wrap items-center">
                  {/* Fragen-Zähler (robust je nach Typ) */}
                  {(() => {
                    const l: any = lesson;
                    // Für Video & Markdown keine Fragenzahl anzeigen
                    if (l.type === 'video' || l.type === 'markdown') return null;
                    let qCount = 0;
                    switch(l.type){
                      case 'single-choice':
                      case 'multiple-choice':
                      case 'matching':
                        if (Array.isArray(l.questions)) qCount = l.questions.length; break;
                      case 'minigame': {
                        // Neuer Modus: content.blocks; Alt: questions
                        if (Array.isArray(l?.content?.blocks)) qCount = l.content.blocks.length;
                        else if (Array.isArray(l.questions)) qCount = l.questions.length;
                        break;
                      }
                      case 'memory': {
                        // memory: Anzahl Paare in content.pairs (Array von Paaren) oder Summe über Blocks
                        const pairs = Array.isArray(l?.content?.pairs)? l.content.pairs : [];
                        qCount = pairs.length ? pairs.length : 0;
                        break;
                      }
                      case 'lueckentext': {
                        // lueckentext: Anzahl Lücken falls vorhanden
                        const gaps = Array.isArray(l?.content?.gaps) ? l.content.gaps : (Array.isArray(l?.content?.items)? l.content.items: []);
                        qCount = gaps.length || 0;
                        break;
                      }
                      case 'ordering': {
                        const items = Array.isArray(l?.content?.items)? l.content.items: [];
                        qCount = items.length ? 1 : 0; // eine Aufgabe
                        break;
                      }
                      case 'text-answer': {
                        // text-answer: content.blocks oder 1 Frage
                        if (Array.isArray(l?.content?.blocks)) qCount = l.content.blocks.length; else qCount = 1;
                        break;
                      }
                      default: {
                        if (Array.isArray(l.questions)) qCount = l.questions.length;
                        else if (Array.isArray(l?.content?.blocks)) qCount = l.content.blocks.length;
                      }
                    }
                    return <span className="text-xs text-gray-500 px-2 py-1 border rounded bg-gray-50">Fragen: {qCount}</span>;
                  })()}
                  <button
                    onClick={async ()=>{
                      try {
                        // Original komplett laden (inkl. courseId, content, questions)
                        const origRes = await fetch(`/api/lessons/${lesson._id}`);
                        if(!origRes.ok){ alert('Original nicht ladbar'); return; }
                        const origData = await origRes.json();
                        const orig = origData.lesson;
                        if(!orig){ alert('Keine Originaldaten'); return; }
                        const payload: any = {
                          // Standalone Kopie NICHT dem ursprünglichen Kurs zuordnen
                          courseId: 'exercise-pool',
                          title: (orig.title||'') + ' (Kopie)',
                          type: orig.type
                        };
                        if (Array.isArray(orig.questions) && orig.questions.length){
                          payload.questions = orig.questions.map((q:any)=>({
                            question: q.question,
                            answers: q.allAnswers || q.answers || [...(q.correctAnswers|| (q.correctAnswer?[q.correctAnswer]:[])), ...(q.wrongAnswers||[])] ,
                            correctAnswer: q.correctAnswer,
                            correctAnswers: q.correctAnswers
                          }));
                        } else if (orig.content) {
                          payload.content = orig.content;
                        }
                        const createRes = await fetch('/api/lessons', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
                        if(!createRes.ok){
                          const txt = await createRes.text();
                          alert('Duplizieren fehlgeschlagen: '+txt);
                          return;
                        }
                        const created = await createRes.json();
                        const newId = created?.lesson?._id || created?.lesson?.id;
                        if(newId){
                          window.location.href = `/autor/lektion/${newId}`;
                        } else {
                          alert('Kopie ohne ID – Liste aktualisieren.');
                        }
                      } catch (e) {
                        alert('Netzwerk/Fehler beim Duplizieren');
                        console.error(e);
                      }
                    }}
                    className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                  >📄 Kopie & Bearb.</button>
                  <button onClick={()=>deleteStandalone(lesson)} className="bg-red-700 text-white px-3 py-1 rounded text-sm" title="Lektion löschen (nur möglich wenn nicht in Kurs)">🗑️ Löschen</button>
                  {lesson.isExercise ? (
                    <>
                      <button onClick={()=>unmark(lesson._id)} className="bg-yellow-600 text-white px-3 py-1 rounded text-sm">Markierung löschen</button>
                      <button onClick={()=>unmark(lesson._id,true)} className="bg-red-600 text-white px-3 py-1 rounded text-sm">Endg. löschen</button>
                    </>
                  ) : (
                    <button disabled={markingId===lesson._id} onClick={()=>mark(lesson._id)} className="bg-green-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50">{markingId===lesson._id?'…':'Als Übung markieren'}</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        {/* Pagination Controls */}
        {filtered.length > pageSize && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 text-sm">
            <div className="text-xs text-gray-500">Seite {page} / {totalPages} • {filtered.length} Übungen gesamt</div>
            <div className="flex flex-wrap gap-2 items-center">
              <button disabled={page===1} onClick={()=>setPage(p=>Math.max(1,p-1))} className="px-2 py-1 border rounded disabled:opacity-40">← Zurück</button>
              {Array.from({length: totalPages}).slice(0,8).map((_,i)=>{
                const p = i+1;
                return <button key={p} onClick={()=>setPage(p)} className={`px-2 py-1 border rounded ${p===page? 'bg-blue-600 text-white border-blue-600':'hover:bg-gray-50'}`}>{p}</button>;
              })}
              {totalPages>8 && <span className="text-xs text-gray-500">…</span>}
              <button disabled={page===totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))} className="px-2 py-1 border rounded disabled:opacity-40">Weiter →</button>
            </div>
          </div>
        )}
        <p className="text-xs text-gray-500">Nur Markierung & Bearbeitung. Neue Übungen anderswo erstellen.</p>
      </div>
    );
  }
// (alter, defekter Codeblock entfernt)
