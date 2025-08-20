import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/models/User';

// Erwartet { username } und liefert completedLessons Array
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const username = url.searchParams.get('username');
    if (!username) return NextResponse.json({ success: false, error: 'username fehlt' }, { status: 400 });
    await dbConnect();
    const users = await User.find({ username }).lean();
    const user = Array.isArray(users) ? users[0] : (users as unknown);
    if (!user) return NextResponse.json({ success: false, error: 'User nicht gefunden' }, { status: 404 });
    const rawCompleted = (user as { completedLessons?: string[] } | null)?.completedLessons || [];
    const normalizedSet = new Set<string>();
    let legacyCount = 0;
    for (const entry of rawCompleted) {
      if (!entry || typeof entry !== 'string') continue;
      if (normalizedSet.has(entry)) continue;
      if (entry.includes('-')) {
        const parts = entry.split('-');
        const last = parts[parts.length - 1];
        if (last && !normalizedSet.has(last)) {
          normalizedSet.add(last);
          legacyCount++;
        }
      } else {
        normalizedSet.add(entry);
      }
    }
    const completed = Array.from(normalizedSet);
    // Keine Schreiboperation in GET, reine Darstellung; Migration erfolgt bei POST oder Admin-Endpunkt
    return NextResponse.json({ success: true, completedLessons: completed, legacyConvertedVirtual: legacyCount });
  } catch (e: unknown) {
    const err = e as { message?: string } | undefined;
    return NextResponse.json({ success: false, error: 'Fehler beim Laden des Fortschritts', details: err?.message }, { status: 500 });
  }
}

// POST { username, lessonId } fügt eine Lesson zu completedLessons hinzu (idempotent)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, lessonId } = body as { username?: unknown; lessonId?: unknown };
    if (!username || !lessonId) return NextResponse.json({ success: false, error: 'username und lessonId erforderlich' }, { status: 400 });
    await dbConnect();
    const userDoc = await User.findOne({ username: String(username) });
    if (!userDoc) return NextResponse.json({ success: false, error: 'User nicht gefunden' }, { status: 404 });
    if (!Array.isArray(userDoc.completedLessons)) {
      userDoc.completedLessons = [];
    }
    const lessonIdStr = String(lessonId);
    // Entferne Legacy-Einträge (courseId-lessonId) für dasselbe lessonId
    userDoc.completedLessons = userDoc.completedLessons.filter(k => {
      if (k === lessonIdStr) return true;
      if (k.includes('-')) {
        const last = k.split('-').pop();
        return last !== lessonIdStr; // behalten nur wenn nicht gleiche lessonId
      }
      return k !== lessonIdStr; // doppelte reine IDs entfernen
    });
    if (!userDoc.completedLessons.includes(lessonIdStr)) {
      userDoc.completedLessons.push(lessonIdStr);
    }
    await userDoc.save();
    return NextResponse.json({ success: true, completedLessons: userDoc.completedLessons });
  } catch (e: unknown) {
    const err = e as { message?: string } | undefined;
    return NextResponse.json({ success: false, error: 'Fehler beim Speichern des Fortschritts', details: err?.message }, { status: 500 });
  }
}
