"use client";
import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface DashboardUser {
  username: string;
  name?: string;
  stars?: number;
  completedLessons: string[];
  role?: string;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [user, setUser] = useState<DashboardUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState<number>(0);
  const [lastLink, setLastLink] = useState<{ courseId?: string; lessonId?: string } | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      if (!session?.user?.username) return;
      try {
        setLoadingUser(true);
        const res = await fetch("/api/user?username=" + encodeURIComponent(session.user.username));
        const data = await res.json();
        if (res.ok && data.user) {
          setUser(data.user as DashboardUser);
          setError(null);
        } else {
          setError(data.error || "Fehler beim Laden der Nutzerdaten");
        }
      } catch {
        setError("Netzwerkfehler");
      } finally {
        setLoadingUser(false);
      }
    };
    void fetchUser();
  }, [session?.user?.username]);

  // Letzte Aktivität (aus localStorage)
  useEffect(() => {
    try {
      const courseId = localStorage.getItem('last:courseId') || undefined;
      const lessonId = localStorage.getItem('last:lessonId') || undefined;
      if (courseId && lessonId) setLastLink({ courseId, lessonId });
      else if (courseId) setLastLink({ courseId });
    } catch { /* ignore */ }
  }, []);

  // Ungelesene Nachrichten (eingehend) zählen und anzeigen
  useEffect(() => {
    let timer: any;
    async function loadUnread(){
      try{
        const res = await fetch('/api/messages/unread');
        const d = await res.json();
        if(res.ok && d.success) setUnread(d.count||0); else setUnread(0);
      } catch { /* ignore */ }
    }
    const r = (session?.user as any)?.role;
    const allowed = r==='teacher' || (r==='learner' && (user as any)?.ownerTeacher);
    if(status==='authenticated' && allowed){
      void loadUnread();
      timer = setInterval(loadUnread, 30000);
    }
    return () => { if(timer) clearInterval(timer); };
  }, [status, (session?.user as any)?.role, (user as any)?.ownerTeacher]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return <div className="text-center mt-10">Lade...</div>;
  }
  if (status === 'unauthenticated') {
    return null; // Redirect läuft in useEffect
  }

  return (
    <main className="max-w-6xl mx-auto mt-10 p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profil-Spalte */}
  <section className="bg-white rounded shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Dein Profil</h2>
            <button onClick={() => signOut({ callbackUrl: '/login', redirect: true })} className="bg-red-600 text-white py-2 px-4 rounded text-sm hover:bg-red-700">Logout</button>
          </div>
          {error && <div className="text-red-600 text-sm mb-4">{error}</div>}
          {loadingUser && !user ? (
            <div>Lade Nutzerdaten...</div>
          ) : user ? (
            <div className="space-y-2">
              <div><strong>Benutzername:</strong> {user.username}</div>
              <div><strong>Name:</strong> {user.name || '—'}</div>
              <div><strong>⭐ Sterne:</strong> {user.stars ?? 0}</div>
              <div><strong>Rolle:</strong> {(session?.user as any)?.role}</div>
              <div className="flex items-center gap-2 flex-wrap">
                <strong>Abgeschlossene Lektionen:</strong>
                <span>{user.completedLessons?.length ?? 0}</span>
              </div>
              {(session?.user as any)?.role === 'pending-author' && (
                <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-300 rounded p-2">Dein Autor-Zugang wartet auf Freischaltung.</div>
              )}
              {(session?.user as any)?.role === 'pending-teacher' && (
                <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-300 rounded p-2">Dein Lehrpersonen-Zugang wartet auf Freischaltung.</div>
              )}
              {(!(session?.user as any)?.role || (session?.user as any)?.role==='learner') && (
                <AutorWerden />
              )}
            </div>
          ) : (
            <div>Keine Nutzerdaten vorhanden.</div>
          )}

          {/* Zuletzt weitergemacht */}
          <div className="mt-6 border-t pt-4">
            <h3 className="font-semibold mb-2">Zuletzt weitergemacht</h3>
            {lastLink?.courseId ? (
              <div className="text-sm">
                {lastLink.lessonId ? (
                  <a href={`/kurs/${lastLink.courseId}/lektion/${lastLink.lessonId}`} className="text-blue-600 hover:underline">
                    Weiter zur letzten Lektion
                  </a>
                ) : (
                  <a href={`/kurs/${lastLink.courseId}`} className="text-blue-600 hover:underline">
                    Zur letzten Kursseite
                  </a>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-500">Noch keine Aktivität erfasst.</div>
            )}
          </div>
        </section>

        {/* Kachel-Spalte */}
        <section className="bg-white rounded shadow p-6">
          <h2 className="text-2xl font-bold mb-4">Schnellzugriff</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <a href="/lernen" className="bg-blue-600 text-white py-3 px-4 rounded text-center font-semibold hover:bg-blue-700 transition">📚 Kurse</a>
            <a href="/ueben" className="bg-green-600 text-white py-3 px-4 rounded text-center font-semibold hover:bg-green-700 transition">✏️ Übungen</a>
            <a href="/arena" className="bg-purple-600 text-white py-3 px-4 rounded text-center font-semibold hover:bg-purple-700 transition">🏆 Arena</a>
            {(['author','admin'] as string[]).includes((session?.user as any)?.role) && (
              <a href="/autor" className="bg-orange-600 text-white py-3 px-4 rounded text-center font-semibold hover:bg-orange-700 transition">🛠️ Autor</a>
            )}
            {(session && (session?.user as any)?.role==='teacher') && (
              <>
                <a href="/teacher" className="bg-indigo-600 text-white py-3 px-4 rounded text-center font-semibold hover:bg-indigo-700 transition">👩‍🏫 Klasse verwalten</a>
                <a href="/teacher/kurse" className="bg-indigo-600 text-white py-3 px-4 rounded text-center font-semibold hover:bg-indigo-700 transition">📚 Kurse zuordnen</a>
              </>
            )}
            {(session?.user as any)?.role === 'admin' && (
              <>
                <a href="/admin/users" className="bg-red-600 text-white py-3 px-4 rounded text-center font-semibold hover:bg-red-700 transition">🔐 Admin</a>
                <a href="/guest" className="bg-yellow-500 text-white py-3 px-4 rounded text-center font-semibold hover:bg-yellow-600 transition" title="Gastmodus: Daten werden nur lokal gespeichert">🧪 Gastzugang</a>
              </>
            )}
            {(((session?.user as any)?.role==='teacher') || (((session?.user as any)?.role==='learner') && (user as any)?.ownerTeacher)) && (
              <a href="/messages" className="relative bg-gray-700 text-white py-3 px-4 rounded text-center font-semibold hover:bg-gray-800 transition" title="Liste: Hintergrund zeigt deinen Lese-Status. Punkt: Orange = Empfänger noch nicht gelesen, Grün = Empfänger hat gelesen.">
                💬 Nachrichten
                {unread>0 && (
                  <span className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-5 text-center">{unread}</span>
                )}
              </a>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function AutorWerden(){
  const [requested,setRequested] = useState(false);
  const [busy,setBusy]=useState(false);
  async function request(){
    setBusy(true);
    try{
      const res = await fetch('/api/user/request-author',{ method:'POST'});
      if(res.ok){ setRequested(true); }
    } finally { setBusy(false); }
  }
  if(requested) return <div className="text-xs text-green-700 bg-green-50 border border-green-300 rounded p-2 mt-2">Anfrage gesendet. Du erscheinst nun als pending-author.</div>;
  return <button disabled={busy} onClick={request} className="mt-3 text-xs px-3 py-1 border rounded bg-white hover:bg-gray-50 disabled:opacity-50">Autor werden (Anfrage)</button>;
}
