"use client";
import { useEffect, useState } from 'react';

export default function ArenaPage() {
  const [mounted, setMounted] = useState(false);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const guest = p.get('guest') === '1' || localStorage.getItem('guest:active') === '1';
      setIsGuest(!!guest);
    } catch {}
    setMounted(true);
  }, []);

  return (
    <main className="max-w-6xl mx-auto mt-10 p-6 bg-white rounded shadow">
  <h2 className="text-2xl font-bold mb-4">🏆 Arena</h2>
      <p className="mb-6 text-gray-700">Hier kannst du gegen andere Spieler antreten und deine Fähigkeiten messen.</p>
      {mounted && isGuest && (
        <div className="mb-4 text-xs text-yellow-800 bg-yellow-50 border border-yellow-300 rounded p-2">
          Gastmodus aktiv: Fortschritte werden nur lokal im Browser gespeichert.
        </div>
      )}
      
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
  <a href="/arena/arenaCity" className="block border rounded p-4 hover:bg-gray-50 transition">
          <div className="flex items-center gap-3">
            <img src="/media/haus.svg" alt="arenaCity" className="w-10 h-10" />
            <div>
              <div className="font-semibold">arenaCity</div>
              <div className="text-sm text-gray-600">Isometrischer City‑Builder</div>
            </div>
          </div>
        </a>
        <a href="/arena/snake-live" className="block border rounded p-4 hover:bg-gray-50 transition">
          <div className="flex items-center gap-3">
            <img src="/media/snake.svg" alt="Snake Live" className="w-10 h-10 object-contain" />
            <div>
              <div className="font-semibold">Snake Live (Beta)</div>
              <div className="text-sm text-gray-600">2 Geräte, gemeinsames Board</div>
            </div>
          </div>
        </a>
        <a href="/arena/snake2" className="block border rounded p-4 hover:bg-gray-50 transition">
          <div className="flex items-center gap-3">
            <img src="/media/snake.svg" alt="Snake 2x" className="w-10 h-10 object-contain" />
            <div>
              <div className="font-semibold">Snake‑Duell</div>
              <div className="text-sm text-gray-600">Zwei Schlangen, ein Board (Pfeile & WASD)</div>
            </div>
          </div>
        </a>
      </div>
      
      <a href="/dashboard" className="bg-gray-600 text-white py-2 px-4 rounded font-semibold hover:bg-gray-700 transition">
        ← Zurück zur Startseite
      </a>
    </main>
  );
}
