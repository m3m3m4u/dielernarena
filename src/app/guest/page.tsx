"use client";

import Link from 'next/link';
import { useEffect } from 'react';

export default function GuestLanding(){
  // Setze einen leichten Hinweis im localStorage, dass Gast aktiv ist
  useEffect(()=>{
    try { localStorage.setItem('guest:active','1'); } catch {}
  },[]);
  return (
    <main className="max-w-3xl mx-auto mt-10 p-6 bg-white rounded shadow">
      <h1 className="text-2xl font-bold mb-3">Gastzugang</h1>
      <p className="text-gray-700 mb-4">Du nutzt den Gastmodus. Deine Fortschritte und Einstellungen werden ausschließlich lokal im Browser gespeichert und nicht auf dem Server.</p>
      <ul className="list-disc pl-6 text-gray-800 mb-6">
        <li>Kurse und Übungen frei erkunden</li>
        <li>Arena ausprobieren</li>
        <li>Keine Registrierung erforderlich</li>
      </ul>
      <div className="flex flex-wrap gap-3">
        <Link href="/lernen?guest=1" className="bg-blue-600 text-white px-4 py-2 rounded">📚 Kurse</Link>
        <Link href="/ueben?guest=1" className="bg-green-600 text-white px-4 py-2 rounded">✏️ Übungen</Link>
        <Link href="/arena?guest=1" className="bg-purple-600 text-white px-4 py-2 rounded">🏆 Arena</Link>
      </div>
      <p className="text-xs text-gray-500 mt-6">Hinweis: Bei Nutzung auf einem anderen Gerät/Browser sind deine lokalen Daten nicht verfügbar.</p>
    </main>
  );
}
