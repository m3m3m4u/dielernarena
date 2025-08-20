"use client";
import { Suspense, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/shared/ToastProvider';

interface TeacherClass { _id:string; name:string; courseAccess?: 'class'|'all'; }
interface Learner { username:string; name?:string; email?:string; class?:string; }

export default function TeacherPanel(){
  return (
    <Suspense fallback={<div className="p-6">Lade…</div>}>
      <TeacherPanelContent />
    </Suspense>
  );
}

function TeacherPanelContent(){
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [classes,setClasses]=useState<TeacherClass[]>([]);
  const [learners,setLearners]=useState<Learner[]>([]);
  const [classCourseState, setClassCourseState] = useState<{ _id:string; name:string; courses: { course: { _id:string; title:string; description?:string }; mode:'link'|'copy'; accessId:string }[] }[]>([]);
  const [allCourses, setAllCourses] = useState<{ _id:string; title:string }[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [newClass,setNewClass]=useState("");
  const [newLearner,setNewLearner]=useState({ username:"", name:"", password:"", email:"", classId:"" });
  const [busy,setBusy]=useState(false);
  
  const [filterClass,setFilterClass]=useState('');
  const [bulkOpen,setBulkOpen]=useState(false);
  const [bulkText,setBulkText]=useState('');
  const [bulkResult,setBulkResult]=useState<{createdCount:number; skippedCount:number; created:any[]; skipped:any[]}|null>(null);
  // Admin-Kontext ist nicht mehr erlaubt
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [coursesBusy, setCoursesBusy] = useState(false);

  useEffect(()=>{
    if(status==='loading') return;
    const role = (session?.user as any)?.role;
  if(status==='unauthenticated') router.push('/login');
  else if(role!=='teacher') router.push('/dashboard');
  },[status,(session?.user as any)?.role,router]);

  async function load(){
    setLoading(true); setError(null);
      try{
        // Parallel: Stammdaten + Kurs-Freischaltungen + Kursliste
        const [res, resCoursesManage, resAllCourses] = await Promise.all([
          fetch('/api/teacher/manage'),
          fetch('/api/teacher/courses/manage'),
          fetch('/api/kurse?showAll=1')
        ]);
        let data:any=null, dataManage:any=null, dataAll:any=null;
        try { data = await res.json(); } catch {}
        try { dataManage = await resCoursesManage.json(); } catch {}
        try { dataAll = await resAllCourses.json(); } catch {}
  if(res.ok && data?.success){ setClasses(data.classes); setLearners(data.learners); }
        else setError((data && (data.error||data.message)) || `Fehler (${res.status})`);
        if(resCoursesManage.ok && dataManage?.success){ setClassCourseState(dataManage.classes||[]); }
        if(resAllCourses.ok && (dataAll?.success || Array.isArray(dataAll?.courses))){
          setAllCourses((dataAll.courses||[]).map((c:any)=>({ _id:String(c._id), title:String(c.title||'') })));
        }
      }catch{ setError('Netzwerkfehler'); }
    setLoading(false);
  }
  useEffect(()=>{ if((session?.user as any)?.role==='teacher') load(); },[(session?.user as any)?.role]);
  // Filter zurücksetzen, wenn sich Klassen ändern
  // Wenn der aktuelle Filter nicht mehr existiert (z. B. anderer Teacher), Filter leeren
  useEffect(()=>{
    if(filterClass && !classes.some(c=>c._id===filterClass)) setFilterClass('');
  }, [classes, filterClass]);

  async function createClass(e:React.FormEvent){
    e.preventDefault(); if(!newClass) return; setBusy(true);
    try{
      const body:any = { action:'createClass', name:newClass };
      const res=await fetch('/api/teacher/manage',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
      const d=await res.json();
  if(res.ok&&d.success){ setClasses(c=>[...c,{ _id:d.class.id, name:d.class.name }]); setNewClass(''); toast({ kind:'success', title:'Klasse erstellt', message:`"${d.class.name}" wurde angelegt.`}); }
    } finally { setBusy(false); }
  }
  async function createLearner(e:React.FormEvent){
    e.preventDefault(); if(!newLearner.username||!newLearner.name||!newLearner.password) return; setBusy(true);
    try{
      const body:any = { action:'createLearner', ...newLearner };
      const res=await fetch('/api/teacher/manage',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
      const d=await res.json();
  if(res.ok&&d.success){ setLearners(l=>[...l,{ username:d.learner.username, name:d.learner.name, class:newLearner.classId||undefined }]); setNewLearner({ username:'', name:'', password:'', email:'', classId:'' }); toast({ kind:'success', title:'Lernender erstellt', message: d.learner.username }); }
  else { setError(d.error||`Fehler (${res.status})`); toast({ kind:'error', title:'Erstellen fehlgeschlagen', message:d.error||'Bitte prüfen.'}); }
    } catch { setError('Netzwerkfehler'); } finally { setBusy(false); }
  }
  async function moveLearner(username:string,classId:string){
    setBusy(true);
    try{
      const body:any = { action:'moveLearner', learnerUsername:username, toClassId: classId||null };
      const res=await fetch('/api/teacher/manage',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
  if(res.ok){ setLearners(ls=>ls.map(l=>l.username===username?{...l,class:classId||undefined}:l)); toast({ kind:'success', title:'Verschoben', message:`${username} wurde zugeordnet.`}); }
    } finally { setBusy(false); }
  }
  async function deleteLearner(username:string){
    if(!confirm(`Lernenden ${username} löschen?`)) return; setBusy(true);
    try{
      const body:any = { action:'deleteLearner', learnerUsername:username };
      const res=await fetch('/api/teacher/manage',{ method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
  if(res.ok){ setLearners(ls=>ls.filter(l=>l.username!==username)); toast({ kind:'success', title:'Gelöscht', message:`${username} wurde entfernt.`}); }
    } finally { setBusy(false); }
  }

  async function enableCourseForClass(){
    if(!selectedClassId || !selectedCourseId) return;
    setCoursesBusy(true);
    try{
      const body:any = { action:'enable', classId: selectedClassId, courseId: selectedCourseId, mode:'link' };
      const res = await fetch('/api/teacher/courses/manage', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const d = await res.json().catch(()=>({}));
      if(res.ok && d?.success){
        // Reload course-state
        const r = await fetch('/api/teacher/courses/manage');
        const dm = await r.json().catch(()=>({}));
        if(r.ok && dm?.success){ setClassCourseState(dm.classes||[]); }
      }
    } finally { setCoursesBusy(false); }
  }

  async function disableCourseForClass(classId:string, courseId:string){
    setCoursesBusy(true);
    try{
      const body:any = { action:'disable', classId, courseId };
      const res = await fetch('/api/teacher/courses/manage', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      if(res.ok){
        setClassCourseState(prev => prev.map(cls => cls._id===classId ? { ...cls, courses: cls.courses.filter(c=>c.course._id!==courseId) } : cls));
      }
    } finally { setCoursesBusy(false); }
  }

  if(status==='loading' || loading) return <div className="p-6">Lade…</div>;

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-10">
      <div className="flex items-center justify-between">
        <button type="button" onClick={()=>router.back()} className="text-sm text-blue-600 hover:underline">← Zurück</button>
  <h1 className="text-2xl font-bold">Klasse verwalten</h1>
        <div />
      </div>
      {error && <div className="text-red-600 text-sm">{error}</div>}

  {/* Admin-Modus entfernt: Admins haben keine Lehrer-Funktionen */}

      {/* Hilfe: Wie funktioniert das? */}
      <details className="bg-blue-50 border border-blue-200 text-blue-900 rounded p-4 text-sm">
        <summary className="font-semibold cursor-pointer">Wie funktioniert das? (Hilfe)</summary>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Lege zuerst Klassen an. Du kannst Lernende einzeln oder per Mehrfach-Import hinzufügen.</li>
          <li>Unter „Zugriff“ stellst du ein, ob Lernende nur klassenbezogene Kurse sehen (Nur Klassenkurse) oder alle veröffentlichten Kurse (Alle Kurse).</li>
          <li>Kurse ordnest du im Bereich „Kurse zuordnen“ deiner Klasse zu. Entweder als Link (Original bleibt erhalten) oder als anpassbare Klassenkopie.</li>
          <li>Entwürfe sind für Lernende unsichtbar. Sichtbar werden Kurse erst nach Veröffentlichung oder wenn sie als Klassenkopie zugeordnet und freigegeben sind – je nach Zugriffseinstellung.</li>
          <li>Statistiken zu Fortschritt und Sternen findest du im Bereich „Statistik“.</li>
        </ul>
        <div className="mt-2 text-xs text-blue-800">
          Tipp: Lektionstypen (z. B. Multiple Choice, Lückentext, Minigame) bearbeitest du im Kurs-Editor. Bei „Minigame“ wählen die Lernenden die Spielform: Snake, Autospiel, Flugzeugspiel, PacMan oder Space Impact.
        </div>
      </details>

      <section className="bg-white border rounded p-4 space-y-4">
        <h2 className="font-semibold">Klassen</h2>
        <form onSubmit={createClass} className="flex gap-2 text-xs">
          <input value={newClass} onChange={e=>setNewClass(e.target.value)} placeholder="Neue Klasse" className="border rounded px-2 py-1" />
          <button disabled={busy} className="bg-blue-600 text-white px-3 py-1 rounded text-xs disabled:opacity-50">Anlegen</button>
        </form>
        <ul className="text-xs pl-0">
          {classes.map(c=> (
            <li key={c._id} className="flex items-center justify-between border-t first:border-t-0 py-1">
              <span className="pl-2 flex items-center gap-3">
                <span>{c.name} <span className="text-gray-400">(ID {c._id})</span></span>
                <span className="inline-flex items-center gap-1">
                  <span className="text-gray-500">Zugriff:</span>
                  <span className="inline-flex border rounded overflow-hidden">
                    <button type="button" onClick={async()=>{ await fetch('/api/teacher/courses/manage',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'setClassCourseScope', classId: c._id, scope: 'class' }) }); load(); }} className={(c.courseAccess!=='all'?'bg-blue-600 text-white':'bg-white text-gray-700 hover:bg-gray-50')+" px-2 py-0.5 border-r"}>Nur Klassenkurse</button>
                    <button type="button" onClick={async()=>{ await fetch('/api/teacher/courses/manage',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'setClassCourseScope', classId: c._id, scope: 'all' }) }); load(); }} className={(c.courseAccess==='all'?'bg-blue-600 text-white':'bg-white text-gray-700 hover:bg-gray-50')+" px-2 py-0.5"}>Alle Kurse</button>
                  </span>
                </span>
              </span>
              <div className="flex items-center gap-2 pr-2">
                <button
                  onClick={async()=>{
                    if(!confirm(`Klasse "${c.name}" löschen? Lernende müssen vorher entfernt werden.`)) return;
                    setBusy(true);
                    try{
                      const res = await fetch('/api/teacher/manage', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'deleteClass', classId: c._id }) });
                      const d = await res.json().catch(()=>({}));
                      if(res.ok && d?.success){
                        setClasses(prev=>prev.filter(x=>x._id!==c._id));
                        toast({ kind:'success', title:'Klasse gelöscht', message:`"${c.name}" wurde gelöscht.`});
                      } else {
                        toast({ kind:'error', title:'Löschen fehlgeschlagen', message: d?.error || 'Bitte erneut versuchen.' });
                      }
                    } finally { setBusy(false); }
                  }}
                  className="text-red-600 hover:underline"
                >Löschen</button>
              </div>
            </li>
          ))}
          {classes.length===0 && <li className="list-none text-gray-500">Keine Klassen</li>}
        </ul>
      </section>

      <section className="bg-white border rounded p-4">
        <h2 className="font-semibold">Kurse zuordnen</h2>
        <p className="text-xs text-gray-600">Wechsle zum Bereich „Kurse zuordnen“, um Kurse für deine Klassen freizuschalten oder neue Kurse zu erstellen.</p>
        <div className="mt-2">
          <a href="/teacher/kurse" className="inline-block text-xs px-3 py-1 border rounded bg-white hover:bg-gray-50">→ Zu „Kurse zuordnen“</a>
        </div>
      </section>

      <section className="bg-white border rounded p-4 space-y-4">
        <h2 className="font-semibold">Lernende</h2>
        <div className="flex flex-wrap gap-2 items-center text-xs">
          <label className="flex items-center gap-1">Filter Klasse:
            <select value={filterClass} onChange={e=>setFilterClass(e.target.value)} className="border rounded px-2 py-1">
              <option value="">(alle)</option>
              {classes.map(c=> <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </label>
          {filterClass && (
            <button type="button" onClick={()=>setFilterClass('')} className="px-2 py-1 border rounded">Filter zurücksetzen</button>
          )}
          <button type="button" onClick={()=>setBulkOpen(true)} className="px-3 py-1 border rounded bg-white hover:bg-gray-50">Mehrere Lernende…</button>
        </div>
        <form onSubmit={createLearner} className="grid gap-2 md:grid-cols-6 text-xs items-start">
          <input value={newLearner.username} onChange={e=>setNewLearner(f=>({...f,username:e.target.value}))} placeholder="Username" className="border rounded px-2 py-1" required />
          <input value={newLearner.name} onChange={e=>setNewLearner(f=>({...f,name:e.target.value}))} placeholder="Name" className="border rounded px-2 py-1" required />
          <input value={newLearner.email} onChange={e=>setNewLearner(f=>({...f,email:e.target.value}))} placeholder="E-Mail" className="border rounded px-2 py-1" />
          <input type="password" value={newLearner.password} onChange={e=>setNewLearner(f=>({...f,password:e.target.value}))} placeholder="Passwort" className="border rounded px-2 py-1" required />
          <select value={newLearner.classId} onChange={e=>setNewLearner(f=>({...f,classId:e.target.value}))} className="border rounded px-2 py-1">
            <option value="">(keine Klasse)</option>
            {classes.map(c=> <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
          <button disabled={busy} className="bg-green-600 text-white px-3 py-1 rounded disabled:opacity-50">Anlegen</button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="py-1 px-2">User</th>
                <th className="py-1 px-2">Name</th>
                <th className="py-1 px-2">E-Mail</th>
                <th className="py-1 px-2">Klasse</th>
                <th className="py-1 px-2">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {learners.filter(l=>!filterClass || l.class===filterClass).map(l=> (
                <tr key={l.username} className="border-t">
                  <td className="py-1 px-2 font-medium">{l.username}</td>
                  <td className="py-1 px-2">{l.name||'—'}</td>
                  <td className="py-1 px-2">{l.email||'—'}</td>
                  <td className="py-1 px-2">
                    <select value={l.class||''} onChange={e=>moveLearner(l.username,e.target.value)} className="border rounded px-1 py-0.5 text-[11px]">
                      <option value="">(keine)</option>
                      {classes.map(c=> <option key={c._id} value={c._id}>{c.name}</option>)}
                    </select>
                  </td>
                  <td className="py-1 px-2">
                    <button onClick={()=>deleteLearner(l.username)} className="text-red-600 hover:underline">Löschen</button>
                  </td>
                </tr>
              ))}
              {learners.length===0 && <tr><td colSpan={5} className="py-2 text-gray-500">Keine Lernenden</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {bulkOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center pt-20 z-50">
          <div className="bg-white w-full max-w-3xl rounded shadow-lg p-4 space-y-4 text-xs">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold">Mehrere Lernende anlegen</h3>
              <button onClick={()=>{setBulkOpen(false); setBulkResult(null);}} className="text-gray-500 hover:text-black">✕</button>
            </div>
            <p className="text-gray-600 leading-relaxed">Format: benutzer, name, passwort, klasse, email (email optional, klasse optional). Trennzeichen: Komma / Semikolon / Tab. Eine Zeile pro Lernendem. Nicht vorhandene Klassen werden automatisch erstellt.</p>
            <textarea value={bulkText} onChange={e=>setBulkText(e.target.value)} rows={10} className="w-full border rounded p-2 font-mono" placeholder="max, Max Mustermann, secret123, 5a, max@example.org"></textarea>
            <div className="flex gap-2">
              <button disabled={busy} onClick={async()=>{ setBusy(true); setBulkResult(null); try{ const body:any = { action:'bulkCreateLearners', lines: bulkText }; const res = await fetch('/api/teacher/manage',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)}); const d=await res.json(); if(res.ok && d.success){ setBulkResult(d); // reload lists
                setLearners(prev=>[...prev, ...d.created.map((c:any)=>({ username:c.username, name:c.name, class: classes.find(cl=>cl.name===c.class)?._id }))]);
                // neue Klassen nachladen (falls erzeugt)
                load();
              } else setBulkResult({ createdCount:0, skippedCount:0, created:[], skipped:[{ line:'', reason:d.error||'Fehler' }]}); } finally { setBusy(false); } }} className="bg-green-600 text-white px-3 py-1 rounded disabled:opacity-50">Import starten</button>
              <button type="button" onClick={()=>{ setBulkText(''); setBulkResult(null); }} className="px-3 py-1 border rounded">Reset</button>
            </div>
            {bulkResult && (
              <div className="border rounded p-2 bg-gray-50 space-y-1">
                <div><strong>Erstellt:</strong> {bulkResult.createdCount} • <strong>Übersprungen:</strong> {bulkResult.skippedCount}</div>
                {bulkResult.skipped.length>0 && <details className="mt-1"><summary className="cursor-pointer">Details übersprungen</summary><ul className="list-disc pl-4 mt-1 space-y-0.5">{bulkResult.skipped.map((s:any,i:number)=><li key={i}>{s.reason} – <code>{s.line}</code></li>)}</ul></details>}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

