"use client";
import { Suspense, useEffect, useMemo, useState } from 'react';
import CategorySelect from '@/components/shared/CategorySelect';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useToast } from '@/components/shared/ToastProvider';
import MediaLibrary from '@/components/media/MediaLibrary';

interface TeacherClass { _id:string; name:string; courseAccess?: 'class'|'all'; }
interface CourseDB { _id:string; title:string; description?:string; category?:string; isPublished?:boolean; author?:string; }

export default function TeacherCoursesPage(){
  return (
    <Suspense fallback={<div className="p-6">Lade…</div>}>
      <TeacherCoursesContent />
    </Suspense>
  );
}

function TeacherCoursesContent(){
  const { data: session, status } = useSession();
  const router = useRouter();
  const search = useSearchParams();
  const { toast } = useToast();
  const initialTab = (()=>{
    const t = search?.get('tab');
    // Backward compat: 'kurse' -> 'eigene'
    if(t==='kurse') return 'eigene';
    return (t==='freigaben'||t==='eigene'||t==='uebernommen'||t==='medien') ? (t as any) : 'eigene';
  })();
  const [tab,setTab] = useState<'eigene'|'uebernommen'|'freigaben'|'medien'>(initialTab as any);

  const username = (session?.user as any)?.username as string|undefined;
  const role = (session?.user as any)?.role as string|undefined;

  const [classes,setClasses] = useState<TeacherClass[]>([]);
  const [courses,setCourses] = useState<CourseDB[]>([]);
  const [lessonCounts,setLessonCounts] = useState<Record<string,number>>({});
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState<string|null>(null);
  const [selectedFreigabeClassId, setSelectedFreigabeClassId] = useState('');

  // Create form
  const [newTitle,setNewTitle] = useState('');
  const [newDesc,setNewDesc] = useState('');
  const [newCategory,setNewCategory] = useState('');
  const [creating,setCreating] = useState(false);

  // Edit inline
  const [editId,setEditId] = useState<string|null>(null);
  const [editTitle,setEditTitle] = useState('');
  const [editDesc,setEditDesc] = useState('');
  const [editCategory,setEditCategory] = useState('');
  const [editPublished,setEditPublished] = useState<boolean>(false);
  const [saving,setSaving] = useState(false);

  useEffect(()=>{
    if(status==='loading') return;
    if(status==='unauthenticated') { router.push('/login'); return; }
    if(role!=='teacher') { router.push('/dashboard'); return; }
  }, [status, role, router]);

  function changeTab(next:'eigene'|'uebernommen'|'freigaben'|'medien'){
    setTab(next);
    try{
      const url = new URL(window.location.href);
      url.searchParams.set('tab', next);
      router.replace(url.pathname + '?' + url.searchParams.toString());
    }catch{}
  }

  async function load(){
    setLoading(true); setError(null);
    try{
      const [resManage, resAll] = await Promise.all([
        fetch('/api/teacher/courses/manage'),
        fetch('/api/kurse?showAll=1')
      ]);
      const dm = await resManage.json().catch(()=>({}));
      const da = await resAll.json().catch(()=>({}));
      if(resManage.ok && dm?.success){
        const cls = (dm.classes||[]) as { _id:string; name:string; courseAccess?: 'class'|'all' }[];
        setClasses(cls);
        if(!selectedFreigabeClassId && cls.length>0){ setSelectedFreigabeClassId(String(cls[0]._id)); }
      } else setError(dm?.error||'Fehler beim Laden der Klassen');
      if(resAll.ok && (da?.success || Array.isArray(da?.courses))){
        setCourses((da.courses||[]) as CourseDB[]);
        // lessonCount ist bereits integriert als lessonCount Feld? API liefert lessonCount separat im Objekt
        const counts: Record<string,number> = {};
        (da.courses||[]).forEach((c:any)=>{ if(typeof c.lessonCount==='number') counts[String(c._id)] = c.lessonCount; });
        setLessonCounts(counts);
      }
    } finally { setLoading(false); }
  }
  useEffect(()=>{ load(); }, []);

  const isOwn = (c: CourseDB) => username && String(c.author||'')===String(username);

  async function assignToClass(courseId:string, classId:string, mode:'link'|'copy', copyTitle?:string){
    if(!classId) return;
    const body = mode==='copy'
      ? { action:'copy', classId, sourceCourseId: courseId, ...(copyTitle?{ title: copyTitle }: {}) }
      : { action:'enable', classId, courseId, mode:'link' };
    const res = await fetch('/api/teacher/courses/manage', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if(!res.ok){ const d = await res.json().catch(()=>({})); toast({ kind:'error', title:'Zuordnung fehlgeschlagen', message: d.error||'Bitte erneut versuchen.' }); }
  else { toast({ kind:'success', title:'Zuordnung gespeichert', message: 'Kurs wurde der Klasse zugeordnet.' }); }
  await load();
  }

  async function removeFromClass(classId:string, courseId:string){
    const res = await fetch('/api/teacher/courses/manage', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'disable', classId, courseId }) });
  if(!res.ok){ const d = await res.json().catch(()=>({})); toast({ kind:'error', title:'Entfernen fehlgeschlagen', message: d.error||'Bitte erneut versuchen.' }); }
  else { toast({ kind:'success', title:'Entfernt', message: 'Kurs wurde aus der Klasse entfernt.' }); }
    await load();
  }

  async function createCourse(e: React.FormEvent){
    e.preventDefault(); if(!newTitle || !newDesc || !newCategory) return; setCreating(true);
    try{
  const res = await fetch('/api/kurse', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title:newTitle, description:newDesc, category:newCategory, author: username }) });
      const d = await res.json();
      if(!res.ok || !d?.success){ toast({ kind:'error', title:'Erstellen fehlgeschlagen', message: d?.error||'Bitte Eingaben prüfen.' }); return; }
      toast({ kind:'success', title:'Kurs erstellt', message: 'Der Kurs wurde angelegt.' });
  setNewTitle(''); setNewDesc(''); setNewCategory('');
  changeTab('eigene');
      await load();
    } finally { setCreating(false); }
  }

  function startEdit(c: CourseDB){
    setEditId(c._id); setEditTitle(c.title||''); setEditDesc(c.description||''); setEditCategory(c.category||''); setEditPublished(!!c.isPublished);
  }
  function cancelEdit(){ setEditId(null); setEditTitle(''); setEditDesc(''); setEditCategory(''); setEditPublished(false); }
  async function saveEdit(){
    if(!editId) return; setSaving(true);
    try{
  const res = await fetch(`/api/kurs/${editId}/settings`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title:editTitle, description:editDesc, category: editCategory||'sonstiges' }) });
      const d = await res.json();
      if(!res.ok || !d?.success){ toast({ kind:'error', title:'Speichern fehlgeschlagen', message: d?.error||'Bitte erneut versuchen.' }); return; }
      toast({ kind:'success', title:'Gespeichert', message: 'Kursdetails wurden gespeichert.' });
      cancelEdit(); await load();
    } finally { setSaving(false); }
  }
  async function deleteCourse(c: CourseDB){
    if(!username || String(c.author||'') !== String(username)) { alert('Nur eigene Kurse löschbar'); return; }
    if(!confirm(`Kurs "${c.title}" wirklich löschen?`)) return;
    const res = await fetch(`/api/kurs/${c._id}`, { method:'DELETE' });
    if(!res.ok){ const d = await res.json().catch(()=>({})); toast({ kind:'error', title:'Löschen fehlgeschlagen', message: d.error||'Bitte erneut versuchen.' }); return; }
    toast({ kind:'success', title:'Gelöscht', message: 'Kurs wurde gelöscht.' });
    await load();
  }

  return (
    <main className="max-w-6xl mx-auto mt-10 p-6">
      {/* Kopfzeile mit Zurück- und Dashboard-Link */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <a href="/teacher" className="text-sm text-blue-600 hover:underline">← Zurück</a>
          <h1 className="text-2xl font-bold">Lehrperson • Kurse</h1>
        </div>
  <a href="/dashboard" className="text-sm text-blue-600 hover:underline">🏠 Startseite</a>
      </div>

      {/* Hilfe: Wie funktionieren Kurse und Freigaben? */}
      <details className="bg-blue-50 border border-blue-200 text-blue-900 rounded p-4 mb-6 text-sm">
        <summary className="font-semibold cursor-pointer">Wie funktioniert das? (Hilfe)</summary>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>„Eigene“ zeigt Kurse, die du erstellt hast. „Übernommene“ zeigt Kurse anderer.</li>
          <li>Ordne Kurse deiner Klasse zu: als <strong>Link</strong> (Original bleibt synchron) oder wandel den Link später in eine <strong>Kopie</strong> um, um Inhalte für die Klasse anzupassen.</li>
          <li>Unter „Freigaben“ siehst du pro Klasse alle zugeordneten Kurse und kannst den <strong>Zugriff</strong> umschalten: Nur Klassenkurse vs. Alle veröffentlichten Kurse.</li>
          <li>Ein Kurs ist für Lernende erst sichtbar, wenn er veröffentlicht ist <em>oder</em> als Klassenkopie zugeordnet und freigegeben wurde – abhängig von der Zugriffseinstellung.</li>
          <li>Lektionen erstellst und bearbeitest du im Kurs-Editor. Unterstützte Typen: Markdown, Multiple Choice, Lückentext, Matching, Ordering, Textantwort, Video, Minigame.</li>
        </ul>
  <div className="mt-2 text-xs text-blue-800">Hinweis: Bei „Minigame“ wählen Lernende die Spielform (Snake, Autospiel, Flugzeugspiel, PacMan oder Space Impact). Standalone-Übungen ohne Kurs kannst du im Autor-Bereich anlegen und später einem Kurs hinzufügen.</div>
      </details>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-gray-200 mb-6 text-sm">
        <button onClick={()=>changeTab('eigene')} className={"pb-2 -mb-px border-b-2 "+(tab==='eigene'?'border-blue-600 font-semibold text-blue-700':'border-transparent text-gray-500 hover:text-gray-800')}>Eigene</button>
        <button onClick={()=>changeTab('uebernommen')} className={"pb-2 -mb-px border-b-2 "+(tab==='uebernommen'?'border-blue-600 font-semibold text-blue-700':'border-transparent text-gray-500 hover:text-gray-800')}>Übernommene</button>
        <button onClick={()=>changeTab('freigaben')} className={"pb-2 -mb-px border-b-2 "+(tab==='freigaben'?'border-blue-600 font-semibold text-blue-700':'border-transparent text-gray-500 hover:text-gray-800')}>Freigaben</button>
        <button onClick={()=>changeTab('medien')} className={"pb-2 -mb-px border-b-2 "+(tab==='medien'?'border-blue-600 font-semibold text-blue-700':'border-transparent text-gray-500 hover:text-gray-800')}>Medien</button>
      </div>

      {(tab==='eigene' || tab==='uebernommen') && (
        <section>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">{tab==='eigene' ? 'Eigene Kurse' : 'Übernommene Kurse'}</h2>
            <button onClick={load} disabled={loading} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50">{loading?'⏳':'⟲'}</button>
          </div>
          {loading && <div className="text-sm text-gray-500 py-8">Lade Kurse…</div>}
          {!loading && courses.length===0 && <div className="text-sm text-gray-500 py-6">Keine Kurse gefunden.</div>}
          <div className="grid gap-4">
            {courses
              .filter(c => tab==='eigene' ? isOwn(c) : !isOwn(c))
              .map(c=> {
                const own = !!isOwn(c);
                return (
                  <div key={c._id} className="bg-white border rounded p-4">
                    {editId===c._id && own ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium mb-1">Titel</label>
                          <input value={editTitle} onChange={e=>setEditTitle(e.target.value)} className="w-full border rounded px-3 py-2" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Beschreibung</label>
                          <textarea value={editDesc} onChange={e=>setEditDesc(e.target.value)} className="w-full border rounded px-3 py-2 h-24" />
                        </div>
                        <div className="flex gap-2 items-center">
                          <CategorySelect
                            value={editCategory}
                            onChange={setEditCategory}
                            label=""
                            includeEmpty
                            emptyLabel="Kategorie wählen"
                            labelClassName="sr-only"
                            selectClassName="border rounded px-2 py-1 text-sm"
                          />
                          {/* Veröffentlicht-Toggle entfernt im Teacher-Kontext */}
                          <div className="flex gap-2 ml-auto">
                            <button disabled={saving} onClick={saveEdit} className="bg-blue-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50">💾 Speichern</button>
                            <button onClick={cancelEdit} className="bg-gray-500 text-white px-3 py-1 rounded text-sm">Abbrechen</button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-semibold">{c.title}</h3>
                          <p className="text-xs text-gray-600">{lessonCounts[c._id]||0} Lektionen • {c.isPublished? 'Veröffentlicht':'Entwurf'}</p>
                          {c.description && <p className="text-xs text-gray-500 mt-1">{c.description}</p>}
                          {c.category && <span className="inline-block mt-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">{c.category}</span>}
                        </div>
                        <div className="flex flex-col gap-2 text-sm min-w-[13rem] items-stretch">
                          <div className="border-t pt-2 text-[11px] text-gray-600">Einer Klasse zuordnen</div>
                          <AssignRow classes={classes} onAssign={(clsId,mode,copyTitle)=>assignToClass(c._id, clsId, mode, copyTitle)} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {tab==='freigaben' && (
        <section className="space-y-4">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold">Freigaben</h2>
              <select value={selectedFreigabeClassId} onChange={e=>setSelectedFreigabeClassId(e.target.value)} className="border rounded px-2 py-1 text-sm">
                {classes.map(c=> <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
            <button onClick={load} disabled={loading} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50">{loading?'⏳':'⟲'}</button>
          </div>
          {classes.length===0 && <div className="text-sm text-gray-500">Keine Klassen vorhanden.</div>}
          {classes.length>0 && selectedFreigabeClassId && (
            <div className="bg-white border rounded p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold">{classes.find(c=>c._id===selectedFreigabeClassId)?.name}</div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-600">Zugriff für Lernende:</span>
                  <ScopeToggle
                    value={(classes.find(c=>c._id===selectedFreigabeClassId)?.courseAccess)||'class'}
                    onChange={async (next)=>{
                      await fetch('/api/teacher/courses/manage', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'setClassCourseScope', classId: selectedFreigabeClassId, scope: next }) });
                      await load();
                    }}
                  />
                </div>
              </div>
              <ClassAssignments classId={selectedFreigabeClassId} lessonCounts={lessonCounts} onRemove={(cid)=>removeFromClass(selectedFreigabeClassId, cid)} />
            </div>
          )}
        </section>
      )}

      {tab==='medien' && (
        <section>
          <MediaLibrary canUpload={false} />
        </section>
      )}

  {/* Tab "neu" entfernt im Teacher-Kontext */}
    </main>
  );
}

function ScopeToggle({ value, onChange }:{ value:'class'|'all'; onChange:(v:'class'|'all')=>void }){
  return (
    <div className="inline-flex border rounded overflow-hidden">
      <button
        type="button"
        onClick={()=>onChange('class')}
        className={(value==='class'?'bg-blue-600 text-white':'bg-white text-gray-700 hover:bg-gray-50')+" px-2 py-1 border-r"}
        title="Nur Klassenkurse: Lernende sehen nur freigegebene Kurse"
  >Nur Klassenkurse</button>
      <button
        type="button"
        onClick={()=>onChange('all')}
        className={(value==='all'?'bg-blue-600 text-white':'bg-white text-gray-700 hover:bg-gray-50')+" px-2 py-1"}
        title="Alle Kurse: Lernende sehen alle veröffentlichten Kurse"
      >Alle Kurse</button>
    </div>
  );
}

function AssignRow({ classes, onAssign }:{ classes: TeacherClass[]; onAssign:(classId:string, mode:'link'|'copy', copyTitle?:string)=>void }){
  const [cls,setCls] = useState('');
  const [title,setTitle] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 items-center text-sm">
        <select value={cls} onChange={e=>setCls(e.target.value)} className="border rounded px-2 py-1">
          <option value="">(Klasse wählen)</option>
          {classes.map(c=> <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
        <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Titel der Kopie (optional – für spätere Anpassung)" className="border rounded px-2 py-1 flex-1 text-sm" />
      </div>
      <div>
        <button onClick={()=>onAssign(cls, 'link', undefined)} disabled={!cls} className="bg-green-600 text-white px-3 py-1 rounded disabled:opacity-50">Als Link zuordnen</button>
      </div>
    </div>
  );
}

function ClassAssignments({ classId, lessonCounts, onRemove }:{ classId:string; lessonCounts: Record<string,number>; onRemove:(courseId:string)=>void }){
  const { toast } = useToast();
  const [items,setItems] = useState<{ course: { _id:string; title:string; description?:string; category?:string; isPublished?:boolean; progressionMode?:string }, mode:'link'|'copy' }[]>([]);
  const [loading,setLoading] = useState(false);
  useEffect(()=>{ load(); }, [classId]);
  async function load(){
    setLoading(true);
    try{
      const res = await fetch('/api/teacher/courses/manage');
      const d = await res.json();
      if(res.ok && d?.success){
        const cls = (d.classes||[]).find((c:any)=> String(c._id)===String(classId));
        setItems(cls?.courses||[]);
      }
    } finally { setLoading(false); }
  }
  if(loading) return <div className="text-sm text-gray-500">Lade…</div>;
  if(!items.length) return <div className="text-sm text-gray-500">Keine Kurse freigeschaltet.</div>;
  return (
    <div className="grid gap-4">
      {items.map(({course, mode}) => (
        <div key={course._id} className="bg-white border rounded p-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <span>{course.title}</span>
              <span className={"text-[10px] px-1.5 py-0.5 rounded border " + (mode==='copy' ? 'border-blue-400 text-blue-700 bg-blue-50' : 'border-gray-300 text-gray-600 bg-gray-50')}>{mode==='copy'?'Kopie':'Link'}</span>
            </h3>
            <p className="text-xs text-gray-600">{(lessonCounts[course._id]||0)} Lektionen • {course.isPublished? 'Veröffentlicht':'Entwurf'}</p>
            {course.description && <p className="text-xs text-gray-500 mt-1">{course.description}</p>}
            {course.category && <span className="inline-block mt-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">{course.category}</span>}
          </div>
          <div className="flex flex-col gap-2 text-sm min-w-[13rem] items-stretch">
            {mode==='link' && (
              <button
                onClick={async ()=>{
                  const title = prompt('Titel für die Klassen-Kopie (optional):') || undefined;
                  const res = await fetch('/api/teacher/courses/manage', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'convertToCopy', classId, courseId: course._id, title }) });
                  if(!res.ok){ const d = await res.json().catch(()=>({})); toast({ kind:'error', title:'Umwandeln fehlgeschlagen', message: d.error||'Bitte erneut versuchen.' }); }
                  else { toast({ kind:'success', title:'Kopie erstellt', message: 'Link wurde in anpassbare Klassenkopie umgewandelt.' }); }
                  await load();
                }}
                className="flex items-center justify-center gap-1 bg-gray-600 text-white px-3 py-1.5 rounded hover:bg-gray-700"
              >Anpassen</button>
            )}
            {mode==='copy' && (
              <a
                href={`/teacher/kurs/${course._id}`}
                className="flex items-center justify-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 text-center"
              >Bearbeiten</a>
            )}
            <button onClick={()=>onRemove(course._id)} className="flex items-center justify-center gap-1 bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700">Entfernen</button>
          </div>
        </div>
      ))}
    </div>
  );
}
