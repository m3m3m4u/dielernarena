"use client";

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

interface Exercise { _id: string; title: string; type: string; courseId: string; createdAt?: string; category?: string; }

function UebenInner() {
  // Gesamtliste aller Übungen (ungefiltert)
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isGuest, setIsGuest] = useState(false);
  const search = useSearchParams();
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  useEffect(()=>{
    try { const p = new URLSearchParams(window.location.search); setIsGuest(p.get('guest')==='1' || localStorage.getItem('guest:active')==='1'); } catch {}
  },[]);
  useEffect(()=>{
    try { setSelectedCategory(search?.get('cat') || ''); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const load = useCallback(async () => {
    // Immer alle Übungen laden; Filter erfolgt clientseitig, damit die Button-Leiste vollständig bleibt
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/exercises`);
      const data = await res.json();
      if (data.success) setAllExercises(data.exercises || []); else setError(data.error || 'Fehler');
    } catch { setError('Netzwerkfehler'); } finally { setLoading(false); }
  }, []);

  useEffect(()=>{ load(); }, [load]);
  // Sync Kategorie in URL (?cat=)
  useEffect(()=>{
    const q = new URLSearchParams(Array.from(search?.entries?.()||[]));
    if (selectedCategory) q.set('cat', selectedCategory); else q.delete('cat');
    router.replace(`?${q.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory]);

  return (
  <main className="max-w-6xl mx-auto mt-10 p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">✏️ Übungen</h2>
          <p className="text-gray-600">Freie Übungslektionen zur Wiederholung.</p>
        </div>
        <button onClick={load} className="px-3 py-1 text-sm border rounded bg-white hover:bg-gray-50">🔄 Aktualisieren</button>
      </div>
      {isGuest && (
        <div className="mb-4 text-xs text-yellow-800 bg-yellow-50 border border-yellow-300 rounded p-2">
          Gastmodus aktiv: Fortschritte werden nur lokal im Browser gespeichert.
        </div>
      )}
    {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 mb-4">{error}</div>}
    {!loading && allExercises.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 items-center">
          <span className="text-sm text-gray-600 mr-1">Fach:</span>
          <button
            type="button"
            onClick={() => setSelectedCategory('')}
            className={`px-3 py-1.5 rounded border text-sm ${selectedCategory === '' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`}
          >Alle</button>
      {Array.from(new Set((allExercises.map(e => e.category).filter(Boolean) as string[])))
            .sort((a, b) => a.localeCompare(b, 'de'))
            .map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded border text-sm ${selectedCategory.toLowerCase() === cat.toLowerCase() ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`}
              >{cat}</button>
            ))}
        </div>
      )}
    {loading ? <div className="text-gray-500">Lade…</div> : (
    allExercises.length === 0 ? <div className="text-gray-500 text-sm">Noch keine Übungen vorhanden.</div> : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {(selectedCategory ? allExercises.filter(e => (e.category || '').toLowerCase() === selectedCategory.toLowerCase()) : allExercises).map(ex => {
              const link = ex.courseId && ex.courseId !== 'exercise-pool' ? `/kurs/${ex.courseId}/lektion/${ex._id}` : `/kurs/${ex.courseId || 'exercise-pool'}/lektion/${ex._id}`;
              return (
                <a key={ex._id} href={link} className="border rounded p-4 bg-white hover:shadow-sm transition flex flex-col gap-2">
                  <h3 className="font-semibold truncate" title={ex.title}>{ex.title}</h3>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded">{ex.type}</span>
                    {ex.category && <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded" title="Fach">{ex.category}</span>}
                    {ex.createdAt && <span>{new Date(ex.createdAt).toLocaleDateString('de-DE')}</span>}
                  </div>
                </a>
              );
            })}
          </div>
        )
      )}
      <div className="mt-10">
  <a href="/dashboard" className="text-blue-600 hover:underline text-sm">← Zurück zur Startseite</a>
      </div>
    </main>
  );
}

export default function UebenPage(){
  return (
    <Suspense fallback={<main className="max-w-6xl mx-auto mt-10 p-6"><div className="text-gray-500">Lade…</div></main>}>
      <UebenInner />
    </Suspense>
  );
}
