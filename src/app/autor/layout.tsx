import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSessionServer } from '@/lib/authOptions';

export default async function AutorLayout({ children }: { children: ReactNode }) {
  const session = await getSessionServer();
  // Nur Autor:innen und Admins dürfen ins Autorentool – Lehrpersonen explizit ausschließen
  if (!session?.user || (session.user.role !== 'author' && session.user.role !== 'admin')) {
    redirect('/login?error=not-author');
  }
  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-gray-50 border-b">
        <div className="max-w-6xl mx-auto px-4 py-2 text-sm">
          <a href="/dashboard" className="text-blue-600 hover:underline">← Zurück zur Startseite</a>
        </div>
      </div>
      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}
