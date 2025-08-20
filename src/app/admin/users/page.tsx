"use client";
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import StickyTable from '@/components/shared/StickyTable';

interface UserRow { username:string; name?:string; role:string; email?:string; createdAt?:string; ownerTeacherUsername?:string; ownerTeacherName?:string; className?:string; }

export default function AdminUsersPage(){
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ username:'', name:'', password:'', email:'', role:'author' });
  const [updating, setUpdating] = useState<string|null>(null);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const PAGE_SIZE = 20;

  useEffect(()=>{
    if(status==='loading') return;
    const role = (session?.user as any)?.role;
    if(status==='unauthenticated' || role !== 'admin'){
      router.push('/dashboard');
    }
  },[status, (session?.user as any)?.role, router]);

  async function load(){
    setLoading(true); setError(null);
    try {
      // Initial: vollständige Liste für die oberen Abschnitte (keine Filter/Pagination)
      const res = await fetch('/api/admin/users');
      const ct = res.headers.get('content-type') || '';
      let data: any = null;
      try { data = ct.includes('application/json') ? await res.json() : { success:false, error: await res.text() }; } catch { /* ignore parse */ }
      if(res.ok && data?.success){ setUsers(data.users); setTotal(data.total ?? data.users.length); }
      else setError(data?.error || `Fehler (${res.status})`);
    } catch { setError('Netzwerkfehler'); }
    setLoading(false);
  }
  useEffect(()=>{ if((session?.user as any)?.role==='admin') load(); }, [(session?.user as any)?.role]);

  async function createUser(e:React.FormEvent){
    e.preventDefault(); if(!createForm.username||!createForm.name||!createForm.password) return;
    setCreating(true); setError(null);
    try{
      const res = await fetch('/api/admin/users',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username:createForm.username, name:createForm.name, password:createForm.password, email:createForm.email, makeRole:createForm.role })});
      const data = await res.json();
      if(res.ok && data.success){ setCreateForm({ username:'', name:'', password:'', email:'', role:'author' }); load(); }
      else setError(data.error||'Fehler');
    } catch { setError('Netzwerkfehler'); }
    setCreating(false);
  }

  async function changeRole(username:string, newRole:string){
    setUpdating(username);
    try {
      const res = await fetch('/api/admin/users',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, newRole })});
      const data = await res.json();
      if(res.ok && data.success){ setUsers(prev=>prev.map(u=>u.username===username?{...u, role:newRole}:u)); }
      else alert(data.error||'Fehler');
    } catch { alert('Netzwerkfehler'); }
    setUpdating(null);
  }

  async function deleteUser(username:string){
    if(!confirm(`Benutzer "${username}" wirklich löschen?`)) return;
    try {
      const res = await fetch('/api/admin/users',{ method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username })});
      const data = await res.json();
      if(res.ok && data.success){
        setUsers(prev=>prev.filter(u=>u.username!==username));
        // Falls aktuelle Seite dadurch leer wird und nicht erste Seite, Seite zurück
        setTimeout(()=>{
          setPage(p=>{
            const maxPage = Math.max(1, Math.ceil((prevLengthAfterDelete()) / PAGE_SIZE));
            return Math.min(p, maxPage);
          });
        },0);
      } else alert(data.error||'Fehler');
    } catch { alert('Netzwerkfehler'); }

    function prevLengthAfterDelete(){
      return users.length - 1; // da bereits aus state herausgefiltert
    }
  }

  // Obere Abschnitte: aus kompletter Users-Liste
  const pending = users.filter(u=>u.role==='pending-author');
  const pendingTeacher = users.filter(u=>u.role==='pending-teacher');
  const teachers = users.filter(u=>u.role==='teacher');
  const authors = users.filter(u=>u.role==='author');

  // Spalten-Definitionen außerhalb von JSX, um Hook-Regeln einzuhalten
  const teachersColumns = useMemo(() => ([
    { key:'username', header:'Username', sticky:true },
    { key:'name', header:'Name' },
    { key:'email', header:'E-Mail' },
    { key:'__actions', header:'Aktion', stickyRight:true, thClassName:'bg-gray-50', tdClassName:'bg-white', render:(t:any)=> (
      <a href={`/admin/teacher?teacher=${encodeURIComponent(t.username)}`} className="text-xs px-2 py-0.5 border rounded hover:bg-gray-50 inline-block">Klassen verwalten</a>
    )},
  ]), []);

  // Untere Tabelle: serverseitig filtern/paginieren
  const [tableRows, setTableRows] = useState<UserRow[]>([]);
  useEffect(()=>{
    let abort = false;
    async function loadPaged(){
      setLoading(true); setError(null);
      try {
        const params = new URLSearchParams();
        if(query) params.set('q', query);
        params.set('page', String(page));
        params.set('pageSize', String(PAGE_SIZE));
        const res = await fetch('/api/admin/users?'+params.toString());
        const ct = res.headers.get('content-type') || '';
        let data: any = null;
        try { data = ct.includes('application/json') ? await res.json() : { success:false, error: await res.text() }; } catch { /* ignore parse */ }
        if(!abort){
          if(res.ok && data?.success){ setTableRows(data.users); setTotal(data.total); }
          else setError(data?.error || `Fehler (${res.status})`);
        }
      } catch { if(!abort) setError('Netzwerkfehler'); }
      if(!abort) setLoading(false);
    }
    if((session?.user as any)?.role==='admin') loadPaged();
    return ()=>{ abort = true; };
  }, [query, page, PAGE_SIZE, (session?.user as any)?.role]);

  const allUsersColumns = useMemo(() => ([
    { key:'username', header:'User', sticky:true, tdClassName:'font-medium whitespace-nowrap' },
    { key:'name', header:'Name', tdClassName:'whitespace-nowrap' },
    { key:'className', header:'Klasse', hideClassName:'hidden sm:table-cell', tdClassName:'whitespace-nowrap' },
    { key:'ownerTeacher', header:'Lehrperson', hideClassName:'hidden md:table-cell', render:(u:any)=> (u.ownerTeacherName? `${u.ownerTeacherName} (${u.ownerTeacherUsername})` : (u.ownerTeacherUsername||'—')), tdClassName:'whitespace-nowrap' },
    { key:'role', header:'Rolle', tdClassName:'whitespace-nowrap' },
    { key:'email', header:'E-Mail', hideClassName:'hidden md:table-cell', tdClassName:'whitespace-nowrap' },
    { key:'__actions', header:'Aktion', stickyRight:true, thClassName:'bg-gray-50', tdClassName:'bg-white', render:(u:any)=> (
      <div className="flex items-center gap-2">
        <select disabled={updating===u.username} value={u.role} onChange={(e)=>changeRole(u.username, e.target.value)} className="border rounded px-1 py-0.5 text-[11px]">
          <option value="learner">learner</option>
          <option value="pending-author">pending-author</option>
          <option value="pending-teacher">pending-teacher</option>
          <option value="author">author</option>
          <option value="teacher">teacher</option>
          <option value="admin">admin</option>
        </select>
        <button type="button" onClick={()=>deleteUser(u.username)} className="text-red-600 hover:underline">Löschen</button>
      </div>
    )},
  ]), [updating]);

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-10">
      <div className="flex items-center justify-between">
  <a href="/dashboard" className="text-sm text-blue-600 hover:underline">← Zurück zur Startseite</a>
        <h1 className="text-2xl font-bold">Benutzerverwaltung</h1>
        <div />
      </div>
      {error && <div className="text-red-600 text-sm">{error}</div>}
  <section className="bg-white border rounded p-4">
        <h2 className="font-semibold mb-3">Ausstehende Autor-Anfragen ({pending.length})</h2>
        {pending.length===0 && <div className="text-xs text-gray-500">Keine.</div>}
        <div className="divide-y">
          {pending.map(p=> (
            <div key={p.username} className="py-2 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
              <div className="text-sm"><span className="font-medium">{p.username}</span>{p.email && <span className="text-gray-500"> • {p.email}</span>}</div>
              <div className="flex gap-2">
                <button disabled={updating===p.username} onClick={()=>changeRole(p.username,'author')} className="px-3 py-1 text-xs rounded bg-green-600 text-white disabled:opacity-50">Freischalten → Autor</button>
                <button disabled={updating===p.username} onClick={()=>changeRole(p.username,'learner')} className="px-3 py-1 text-xs rounded bg-gray-600 text-white disabled:opacity-50">Ablehnen</button>
              </div>
            </div>
          ))}
        </div>
      </section>

  <section className="bg-white border rounded p-4">
        <h2 className="font-semibold mb-3">Ausstehende Lehrpersonen-Anfragen ({pendingTeacher.length})</h2>
        {pendingTeacher.length===0 && <div className="text-xs text-gray-500">Keine.</div>}
        <div className="divide-y">
          {pendingTeacher.map(p=> (
            <div key={p.username} className="py-2 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
              <div className="text-sm"><span className="font-medium">{p.username}</span>{p.email && <span className="text-gray-500"> • {p.email}</span>}</div>
              <div className="flex gap-2">
                <button disabled={updating===p.username} onClick={()=>changeRole(p.username,'teacher')} className="px-3 py-1 text-xs rounded bg-green-600 text-white disabled:opacity-50">Freischalten → Lehrperson</button>
                <button disabled={updating===p.username} onClick={()=>changeRole(p.username,'learner')} className="px-3 py-1 text-xs rounded bg-gray-600 text-white disabled:opacity-50">Ablehnen</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border rounded p-4">
        <h2 className="font-semibold mb-3">Lehrpersonen ({teachers.length})</h2>
        <StickyTable
          columns={teachersColumns}
          rows={teachers as any}
          minWidthClassName="min-w-[700px]"
          density="compact"
          zebra
          emptyMessage="Keine Lehrpersonen."
        />
      </section>

      <section className="bg-white border rounded p-4">
        <h2 className="font-semibold mb-3">Autoren ({authors.length})</h2>
        <div className="grid gap-2">
          {authors.map(a=> (
            <div key={a.username} className="text-xs flex items-center justify-between border rounded px-2 py-1">
              <span>{a.username}{a.email && <span className="text-gray-500"> • {a.email}</span>}</span>
              <div className="flex gap-2">
                <button disabled={updating===a.username} onClick={()=>changeRole(a.username,'pending-author')} className="px-2 py-0.5 border rounded text-[10px] hover:bg-gray-50">Zurückstellen</button>
                <button disabled={updating===a.username} onClick={()=>changeRole(a.username,'learner')} className="px-2 py-0.5 border rounded text-[10px] hover:bg-gray-50">Entziehen</button>
              </div>
            </div>
          ))}
          {authors.length===0 && <div className="text-xs text-gray-500">Keine Autoren.</div>}
        </div>
      </section>

      <section className="bg-white border rounded p-4">
        <h2 className="font-semibold mb-3">Neuen speziellen Benutzer anlegen</h2>
        <form onSubmit={createUser} className="grid gap-3 md:grid-cols-5 text-xs">
          <input value={createForm.username} onChange={e=>setCreateForm(f=>({...f,username:e.target.value}))} placeholder="Username" className="border rounded px-2 py-1" required />
          <input value={createForm.name} onChange={e=>setCreateForm(f=>({...f,name:e.target.value}))} placeholder="Name" className="border rounded px-2 py-1" required />
          <input value={createForm.email} onChange={e=>setCreateForm(f=>({...f,email:e.target.value}))} placeholder="E-Mail" className="border rounded px-2 py-1" />
          <input type="password" value={createForm.password} onChange={e=>setCreateForm(f=>({...f,password:e.target.value}))} placeholder="Passwort" className="border rounded px-2 py-1" required />
          <select value={createForm.role} onChange={e=>setCreateForm(f=>({...f,role:e.target.value}))} className="border rounded px-2 py-1" required>
            <option value="author">Autor</option>
            <option value="teacher">Lehrperson</option>
            <option value="admin">Admin</option>
          </select>
          <div className="md:col-span-5 flex gap-2">
            <button disabled={creating} className="bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-50">{creating? '…':'Erstellen'}</button>
            <button type="button" onClick={()=>setCreateForm({ username:'', name:'', password:'', email:'', role:'author' })} className="px-3 py-1 border rounded">Reset</button>
          </div>
        </form>
      </section>

      <section className="bg-white border rounded p-4">
        <h2 className="font-semibold mb-3">Alle Benutzer</h2>
  <div className="flex items-center gap-2 mb-3 text-xs">
          <input value={query} onChange={e=>{ setQuery(e.target.value); setPage(1); }} placeholder="Suche (User, Name, E-Mail, Klasse, Lehrperson)" className="border rounded px-2 py-1 w-full" />
          {query && <button onClick={()=>setQuery('')} className="px-2 py-1 border rounded">Reset</button>}
        </div>
        {loading ? <div className="text-xs text-gray-500">Lade…</div> : (
          <>
            <StickyTable
              columns={allUsersColumns}
              rows={tableRows as any}
              minWidthClassName="min-w-[900px]"
              density="compact"
              zebra
              emptyMessage="Keine Benutzer gefunden."
            />
            <div className="flex justify-between items-center mt-2 text-[11px]">
              <div>Seite {page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}</div>
              <div className="flex gap-2">
                <button disabled={page===1} onClick={()=>setPage(p=>Math.max(1,p-1))} className="px-2 py-1 border rounded disabled:opacity-40">« Zurück</button>
                <button disabled={page>=Math.ceil(total / PAGE_SIZE)} onClick={()=>setPage(p=>p+1)} className="px-2 py-1 border rounded disabled:opacity-40">Weiter »</button>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
