"use client";
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface Msg { _id:string; sender:any; recipientUser?:any; recipientClass?:any; subject:string; body:string; createdAt:string; readBy?:string[]; parentMessage?:string; threadId?:string; }
interface Option { value:string; label:string; }

export default function MessagesPage(){
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = (session?.user as any)?.role;
  const myId = (session?.user as any)?.id as string | undefined;
  const [messages,setMessages]=useState<Msg[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [page,setPage]=useState(1);
  const [pages,setPages]=useState(1);
  const [subject,setSubject]=useState('');
  const [body,setBody]=useState('');
  const [recipientUser,setRecipientUser]=useState('');
  const [recipientClass,setRecipientClass]=useState('');
  const [learners,setLearners]=useState<Option[]>([]);
  const [classes,setClasses]=useState<Option[]>([]);
  const [folder,setFolder]=useState<'inbox'|'outbox'|'trash'>('inbox');

  useEffect(()=>{
    if(status==='unauthenticated') { router.push('/login'); return; }
    // Nur Teacher und Learner dürfen Nachrichten nutzen (Autoren/Admins raus)
    const r = (session?.user as any)?.role;
    if(status==='authenticated' && r && r!=='teacher' && r!=='learner'){
      router.push('/dashboard');
    }
  },[status,router,(session?.user as any)?.role]);

  async function load(){
    setLoading(true); setError(null);
    try{
  const view = folder==='trash'? 'trash' : 'threads';
  const res = await fetch('/api/messages?view='+view+'&page='+page);
      const d = await res.json();
      if(res.ok && d.success){ setMessages(d.messages||[]); setPages(d.meta?.pages||1); }
      else setError(d.error||'Fehler');
    } catch { setError('Netzwerkfehler'); }
    setLoading(false);
  }
  useEffect(()=>{ if(role) load(); },[role,page,folder]);

  // Für Teacher: verfügbare Klassen/Lernende holen (nutzt vorhandenes Manage-API)
  useEffect(()=>{
    async function loadContext(){
      if(role==='teacher' || role==='admin'){
        try{ const res = await fetch('/api/teacher/manage'); const d=await res.json(); if(res.ok && d.success){
          setClasses((d.classes||[]).map((c:any)=>({ value:c._id, label:c.name })));
          setLearners((d.learners||[]).map((l:any)=>({ value:l._id||l.username, label:`${l.name||l.username}` })));
        }} catch {}
      }
    }
    loadContext();
  },[role]);

  async function send(e:React.FormEvent){
    e.preventDefault(); if(!subject || !body) return;
    const payload:any = { subject, body };
    if(role==='teacher' || role==='admin'){
      if(recipientClass) payload.recipientClass = recipientClass;
      else if(recipientUser) payload.recipientUser = recipientUser;
      else { setError('Empfänger wählen'); return; }
    }
    setError(null);
    const res = await fetch('/api/messages',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const d = await res.json();
    if(res.ok && d.success){ setSubject(''); setBody(''); setRecipientUser(''); setRecipientClass(''); load(); }
    else setError(d.error||'Fehler');
  }

  async function markRead(id:string, read:boolean){
    try{ const res=await fetch('/api/messages',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ messageId:id, read })}); if(res.ok) load(); } catch{}
  }
  async function del(id:string){
    if(!confirm('Nachricht ausblenden?')) return;
    try{ const res=await fetch('/api/messages',{ method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ messageId:id })}); if(res.ok) load(); } catch{}
  }

  async function restore(id:string){
    try{ const res=await fetch('/api/messages',{ method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ messageId:id })}); if(res.ok) load(); } catch{}
  }
  async function purge(id:string){
    if(!confirm('Endgültig löschen? Dies kann nicht rückgängig gemacht werden.')) return;
  try{ const res=await fetch('/api/messages',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'purge', messageId:id })}); if(res.ok) load(); } catch{}
  }

  function isReadByMe(m: Msg): boolean{
    if(!myId) return false;
    const arr = Array.isArray((m as any).readBy) ? (m as any).readBy : [];
    return arr.some((x:any)=> String(x)===String(myId));
  }
  function isOutgoing(m: Msg): boolean{
    const sid = (m.sender as any)?._id || (typeof (m.sender as any)==='string'? m.sender : undefined);
    return !!myId && String(sid)===String(myId);
  }
  function isReadByOther(m: Msg): boolean | null{
    if(!Array.isArray((m as any).readBy)) return false;
    if(!isOutgoing(m)) return null; // Nur bei selbst gesendeten Nachrichten anzeigen
    const arr = (m as any).readBy as any[];
    const hasOther = arr.some((x:any)=> String(x)!==String(myId));
    if((m as any).recipientUser){
      const rid = ((m as any).recipientUser as any)?._id || ((typeof (m as any).recipientUser==='string')?(m as any).recipientUser: undefined);
      if(rid) return arr.some((x:any)=> String(x)===String(rid));
    }
    // Für Klassen: "andere gelesen" wenn irgendwer außer mir gelesen hat
    return hasOther;
  }


  return (
  <main className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
  <a href="/dashboard" className="text-sm text-blue-600 hover:underline">← Zurück zur Startseite</a>
        <h1 className="text-2xl font-bold">Nachrichten</h1>
        <div />
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <section className="bg-white border rounded p-4 space-y-3">
        <h2 className="font-semibold">Neue Nachricht</h2>
        <form onSubmit={send} className="grid gap-2 text-sm">
          {(role==='teacher' || role==='admin') && (
            <div className="flex gap-2 flex-wrap">
              <select value={recipientClass} onChange={e=>{ setRecipientClass(e.target.value); if(e.target.value) setRecipientUser(''); }} className="border rounded px-2 py-1">
                <option value="">An Klasse…</option>
                {classes.map(c=> <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <select value={recipientUser} onChange={e=>{ setRecipientUser(e.target.value); if(e.target.value) setRecipientClass(''); }} className="border rounded px-2 py-1">
                <option value="">An Lernenden…</option>
                {learners.map(l=> <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
          )}
          <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Betreff" className="border rounded px-2 py-1" required />
          <textarea value={body} onChange={e=>setBody(e.target.value)} placeholder="Nachricht" rows={5} className="border rounded px-2 py-1" required />
          <div>
            <button className="px-3 py-1 rounded bg-blue-600 text-white">Senden</button>
          </div>
        </form>
      </section>

      <section className="bg-white border rounded p-4 space-y-3">
        <h2 className="font-semibold">Eingang/Ausgang</h2>
        <div className="flex gap-2 text-sm">
          <button onClick={()=>{ setPage(1); setFolder('inbox'); }} className={`px-3 py-1 border rounded ${folder==='inbox'?'bg-gray-800 text-white':'bg-white'}`}>Eingang ({messages.filter(m=>!isOutgoing(m)).length})</button>
          <button onClick={()=>{ setPage(1); setFolder('outbox'); }} className={`px-3 py-1 border rounded ${folder==='outbox'?'bg-gray-800 text-white':'bg-white'}`}>Ausgang ({messages.filter(m=>isOutgoing(m)).length})</button>
          <button onClick={()=>{ setPage(1); setFolder('trash'); }} className={`px-3 py-1 border rounded ${folder==='trash'?'bg-gray-800 text-white':'bg-white'}`}>Papierkorb</button>
        </div>
        {loading? <div className="text-sm text-gray-500">Lade…</div> : (
          <ul className="space-y-2 text-sm">
            {messages.filter(m=> folder==='trash' ? true : (folder==='outbox'? isOutgoing(m) : !isOutgoing(m))).map(m=> {
              const meRead = isReadByMe(m);
              const otherRead = isReadByOther(m);
              return (
              <li key={m._id} className={`border rounded p-2 ${meRead? 'bg-white':'bg-yellow-50'}`}>
                <div className="flex items-center justify-between">
                  <div className="font-semibold flex items-center gap-2">
                    {m.subject}
                    {otherRead!==null && (
                      <span title={otherRead? 'Empfänger hat gelesen':'Empfänger hat noch nicht gelesen'} className={`inline-block w-2 h-2 rounded-full ${otherRead? 'bg-green-500':'bg-orange-500'}`} />
                    )}
                  </div>
                  <div className="flex gap-2 text-xs">
                    {folder!=='trash' ? (
                      <>
                        <button onClick={()=>markRead(m._id,true)} className="px-2 py-0.5 border rounded">Gelesen</button>
                        <button onClick={()=>markRead(m._id,false)} className="px-2 py-0.5 border rounded">Ungelesen</button>
                        <button onClick={()=>del(m._id)} className="px-2 py-0.5 border rounded text-red-600">Löschen</button>
                      </>
                    ) : (
                      <>
                        <button onClick={()=>restore(m._id)} className="px-2 py-0.5 border rounded">Wiederherstellen</button>
                        <button onClick={()=>purge(m._id)} className="px-2 py-0.5 border rounded text-red-700">Endgültig löschen</button>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-gray-600 text-xs flex flex-wrap items-center gap-2">
                  <span className="font-medium">{m.sender?.name || m.sender?.username || '—'}</span>
                  <span>• {new Date(m.createdAt).toLocaleString()}</span>
                  {m.recipientUser && <span>• an {(m.recipientUser as any)?.name || (m.recipientUser as any)?.username}</span>}
                  {m.recipientClass && <span className="px-1.5 py-0.5 border rounded bg-gray-50">Klasse: {(m.recipientClass as any)?.name || '—'}</span>}
                  {meRead && <span className="text-green-700">• von dir gelesen</span>}
                </div>
                <div className="mt-1 whitespace-pre-wrap">{m.body}</div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-blue-700">Antworten…</summary>
                  <ReplyForm role={role} message={m} onSent={load} />
                </details>
        <ThreadViewer id={m.threadId || m._id} />
              </li>
            )})}
      {messages.length===0 && <li className="text-gray-500">Keine Nachrichten</li>}
          </ul>
        )}
      </section>
      <div className="flex items-center justify-between text-sm">
        <button disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))} className="px-3 py-1 border rounded disabled:opacity-50">« Zurück</button>
        <span>Seite {page} / {pages}</span>
        <button disabled={page>=pages} onClick={()=>setPage(p=>p+1)} className="px-3 py-1 border rounded disabled:opacity-50">Weiter »</button>
      </div>
    </main>
  );
}

function ReplyForm({ role, message, onSent }:{ role:string; message:Msg; onSent:()=>void }){
  const [subject,setSubject]=useState(message.subject?.startsWith('Re:')? message.subject : `Re: ${message.subject}`);
  const [body,setBody]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string>('');
  async function sendReply(e:React.FormEvent){
    e.preventDefault(); setBusy(true);
    try{
      const payload:any = { subject, body, parentMessage: message._id };
      if(role==='teacher' || role==='admin'){
        // Wenn ursprüngliche Nachricht an eine Klasse ging, antworte an dieselbe Klasse.
        const clsId = (message.recipientClass as any)?._id || (typeof (message.recipientClass as any) === 'string' ? message.recipientClass : null);
        if(clsId){
          payload.recipientClass = clsId;
        } else {
          // sonst an den ursprünglichen Sender (Lernenden)
          const senderId = (message.sender as any)?._id || (typeof (message.sender as any) === 'string' ? message.sender : null);
          if(senderId){ payload.recipientUser = senderId; }
        }
      }
      const res = await fetch('/api/messages',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const d = await res.json();
      if(res.ok && d.success){ setBody(''); setError(''); onSent(); }
      else setError(d.error||`Fehler (${res.status})`);
    } finally { setBusy(false); }
  }
  return (
    <form onSubmit={sendReply} className="mt-2 grid gap-2 text-sm">
      {error && <div className="text-red-600 text-xs">{error}</div>}
      <input value={subject} onChange={e=>setSubject(e.target.value)} className="border rounded px-2 py-1" />
      <textarea value={body} onChange={e=>setBody(e.target.value)} rows={3} className="border rounded px-2 py-1" />
      <div>
        <button disabled={busy} className="px-2 py-1 bg-blue-600 text-white rounded disabled:opacity-50">Antwort senden</button>
      </div>
    </form>
  );
}

function ThreadViewer({ id }:{ id:string }){
  const [open,setOpen]=useState(false);
  const [loading,setLoading]=useState(false);
  const [msgs,setMsgs]=useState<Msg[]>([]);
  async function load(){
    setLoading(true);
    try{ const res = await fetch('/api/messages/thread?id='+encodeURIComponent(id)); const d=await res.json(); if(res.ok && d.success){ setMsgs(d.messages||[]); } } finally { setLoading(false); }
  }
  useEffect(()=>{ if(open && msgs.length===0) load(); },[open]);
  return (
    <details className="mt-2" open={open} onToggle={e=>setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-xs text-blue-700">Verlauf anzeigen</summary>
      {loading? <div className="text-xs text-gray-500">Lade…</div> : (
        <ul className="mt-2 space-y-1 text-xs">
          {msgs.map(m=> (
            <li key={m._id} className="border rounded p-2">
              <div className="font-semibold">{m.subject}</div>
              <div className="text-gray-600 flex flex-wrap items-center gap-2">
                <span className="font-medium">{m.sender?.name||m.sender?.username||'—'}</span>
                <span>• {new Date(m.createdAt).toLocaleString()}</span>
                {m.recipientUser && <span>• an {(m.recipientUser as any)?.name || (m.recipientUser as any)?.username}</span>}
                {m.recipientClass && <span className="px-1.5 py-0.5 border rounded bg-gray-50">Klasse: {(m.recipientClass as any)?.name || '—'}</span>}
              </div>
              <div className="mt-1 whitespace-pre-wrap">{m.body}</div>
            </li>
          ))}
          {msgs.length===0 && <li className="text-gray-500">Kein Verlauf</li>}
        </ul>
      )}
    </details>
  );
}
