"use client";
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import StickyTable from '@/components/shared/StickyTable';

interface TeacherClass { _id:string; name:string; }
interface Learner { _id:string; username:string; name?:string; email?:string; class?:string; }

function AdminTeacherManageInner(){
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const teacher = params?.get('teacher') || '';
  const teacherIdParam = params?.get('teacherId') || '';
  const [classes,setClasses]=useState<TeacherClass[]>([]);
  const [learners,setLearners]=useState<Learner[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [newClass,setNewClass]=useState('');
  const [newLearner,setNewLearner]=useState({ username:'', name:'', password:'', email:'', classId:'' });
  const [teacherLabel,setTeacherLabel]=useState<string>('');

  useEffect(()=>{
    if(status==='loading') return;
    if(status==='unauthenticated' || (session?.user as any)?.role!=='admin'){
      router.push('/dashboard');
    }
  }, [status, (session?.user as any)?.role, router]);

  async function load(){
    setLoading(true); setError(null);
    try{
      const q = new URLSearchParams();
      if(teacher) q.set('teacher', teacher);
      if(teacherIdParam) q.set('teacherId', teacherIdParam);
      const res = await fetch('/api/admin/teacher/manage?'+q.toString());
      const d = await res.json();
  if(res.ok && d.success){ setClasses(d.classes||[]); setLearners(d.learners||[]); setTeacherLabel(d.teacherUser? (d.teacherUser.name||d.teacherUser.username||'') : (teacher||teacherIdParam)); }
      else setError(d.error||'Fehler');
    } catch { setError('Netzwerkfehler'); }
    setLoading(false);
  }
  useEffect(()=>{ if((session?.user as any)?.role==='admin' && (teacher||teacherIdParam)) load(); }, [(session?.user as any)?.role, teacher, teacherIdParam]);

  async function createClass(e:React.FormEvent){
    e.preventDefault(); if(!newClass) return;
    try{
      const body:any = { action:'createClass', name:newClass, teacherUsername: teacher||undefined, teacherId: teacherIdParam||undefined };
      const res = await fetch('/api/admin/teacher/manage',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const d = await res.json();
      if(res.ok && d.success){ setNewClass(''); load(); }
    } catch {}
  }
  async function createLearner(e:React.FormEvent){
    e.preventDefault(); const { username,name,password,email,classId } = newLearner; if(!username||!name||!password) return;
    try{
      const body:any = { action:'createLearner', username,name,password,email,classId: classId||undefined, teacherUsername: teacher||undefined, teacherId: teacherIdParam||undefined };
      const res = await fetch('/api/admin/teacher/manage',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const d = await res.json();
      if(res.ok && d.success){ setNewLearner({ username:'', name:'', password:'', email:'', classId:'' }); load(); }
    } catch {}
  }
  async function moveLearner(username:string, toClassId:string){
    try{
      const body:any = { action:'moveLearner', learnerUsername: username, toClassId: toClassId||null, teacherUsername: teacher||undefined, teacherId: teacherIdParam||undefined };
      const res = await fetch('/api/admin/teacher/manage',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      if(res.ok){ load(); }
    } catch {}
  }
  async function deleteLearner(username:string){
    if(!confirm(`Lernenden ${username} löschen?`)) return;
    try{
      const body:any = { action:'deleteLearner', learnerUsername: username, teacherUsername: teacher||undefined, teacherId: teacherIdParam||undefined };
      const res = await fetch('/api/admin/teacher/manage',{ method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      if(res.ok){ load(); }
    } catch {}
  }

  // Tabellen-Spalten memoisieren (Top-Level, nicht in JSX), um Hook-Regeln einzuhalten
  const columns = useMemo(() => [
    { key:'username', header:'User', sticky:true, tdClassName:'font-medium whitespace-nowrap' },
    { key:'name', header:'Name', tdClassName:'whitespace-nowrap' },
    { key:'email', header:'E-Mail', hideClassName:'hidden sm:table-cell', tdClassName:'whitespace-nowrap' },
    { key:'class', header:'Klasse', render:(l:any)=> (
      <select value={l.class||''} onChange={(e)=>moveLearner(l.username, e.target.value)} className="border rounded px-1 py-0.5 text-[11px]">
        <option value="">(keine)</option>
        {classes.map(c=> <option key={c._id} value={c._id}>{c.name}</option>)}
      </select>
    )},
    { key:'__actions', header:'Aktion', stickyRight:true, thClassName:'bg-gray-50', tdClassName:'bg-white', render:(l:any)=> (
      <button onClick={()=>deleteLearner(l.username)} className="text-red-600 hover:underline">Löschen</button>
    )},
  ], [classes, moveLearner, deleteLearner]);

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <a href="/admin/users" className="text-sm text-blue-600 hover:underline">← Zurück</a>
        <h1 className="text-2xl font-bold">Admin: Klassen & Lernende verwalten</h1>
        <div />
      </div>
      {!teacher && !teacherIdParam && <div className="text-sm text-gray-600">Füge ?teacher=<b>username</b> oder ?teacherId=<b>ObjectId</b> an die URL an.</div>}
      {(teacherLabel) && (
        <div className="text-sm text-gray-800 bg-yellow-50 border border-yellow-200 rounded p-2 mb-2">
          Du verwaltest die Klassen von der Lehrperson <span className="font-semibold">{teacherLabel}</span>
        </div>
      )}
      {error && <div className="text-red-600 text-sm">{error}</div>}
      {loading && <div className="text-sm text-gray-500">Lade…</div>}

  {(teacher || teacherIdParam) && (
        <section className="bg-white border rounded p-4 space-y-4">
          <h2 className="font-semibold">Klassen</h2>
          <form onSubmit={createClass} className="flex gap-2 text-xs">
            <input value={newClass} onChange={e=>setNewClass(e.target.value)} placeholder="Neue Klasse" className="border rounded px-2 py-1" />
            <button className="bg-blue-600 text-white px-3 py-1 rounded text-xs">Anlegen</button>
          </form>
          <ul className="text-xs list-disc pl-4">
            {classes.map(c=> <li key={c._id}>{c.name} (ID {c._id})</li>)}
            {classes.length===0 && <li className="list-none text-gray-500">Keine Klassen</li>}
          </ul>
        </section>
      )}

  {(teacher || teacherIdParam) && (
        <section className="bg-white border rounded p-4 space-y-4">
          <h2 className="font-semibold">Lernende</h2>
          <form onSubmit={createLearner} className="grid gap-2 md:grid-cols-6 text-xs items-start">
            <input value={newLearner.username} onChange={e=>setNewLearner(f=>({...f,username:e.target.value}))} placeholder="Username" className="border rounded px-2 py-1" required />
            <input value={newLearner.name} onChange={e=>setNewLearner(f=>({...f,name:e.target.value}))} placeholder="Name" className="border rounded px-2 py-1" required />
            <input value={newLearner.email} onChange={e=>setNewLearner(f=>({...f,email:e.target.value}))} placeholder="E-Mail" className="border rounded px-2 py-1" />
            <input type="password" value={newLearner.password} onChange={e=>setNewLearner(f=>({...f,password:e.target.value}))} placeholder="Passwort" className="border rounded px-2 py-1" required />
            <select value={newLearner.classId} onChange={e=>setNewLearner(f=>({...f,classId:e.target.value}))} className="border rounded px-2 py-1">
              <option value="">(keine Klasse)</option>
              {classes.map(c=> <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            <button className="bg-green-600 text-white px-3 py-1 rounded">Anlegen</button>
          </form>

            <StickyTable
              columns={columns}
              rows={learners as any}
              minWidthClassName="min-w-[800px]"
              density="compact"
              zebra
              emptyMessage="Keine Lernenden"
            />
        </section>
      )}
    </main>
  );
}

export default function AdminTeacherManagePage(){
  return (
  <Suspense fallback={<main className="max-w-6xl mx-auto p-6"><div className="text-sm text-gray-500">Lade…</div></main>}>
      <AdminTeacherManageInner />
    </Suspense>
  );
}
