import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import User from "@/models/User";
import AuditLog from "@/models/AuditLog";

/*
  POST /api/lesson/reset
  Body: { username: string; lessonId: string }
  Wirkung: Entfernt lessonId aus completedLessons falls vorhanden.
  Sterne werden NICHT reduziert (Gamification: einmal verdiente Sterne bleiben bestehen).
*/
export async function POST(req: NextRequest) {
  await dbConnect();
  try {
    const { username, lessonId } = await req.json() as { username?: string; lessonId?: string };
    if (!username || !lessonId) {
      return NextResponse.json({ success: false, error: 'username und lessonId erforderlich' }, { status: 400 });
    }
    const user = await User.findOne({ username });
    if (!user) {
      return NextResponse.json({ success: false, error: 'User nicht gefunden' }, { status: 404 });
    }
    if (!Array.isArray(user.completedLessons)) user.completedLessons = [];
    const before = user.completedLessons.length;
    user.completedLessons = user.completedLessons.filter((id: string) => {
      if (!id) return false;
      // Legacy Eintrag courseId-lessonId oder plain lessonId
      if (id === lessonId) return false;
      if (id.includes('-')) {
        const last = id.split('-').pop();
        if (last === lessonId) return false; // entfernen
      }
      return true;
    });
    const removed = before !== user.completedLessons.length;
    if (removed) {
      await user.save();
      try {
        await AuditLog.create({ action: 'lesson.reset', user: username, targetType: 'lesson', targetId: String(lessonId), meta: { removed } });
      } catch (e) { console.warn('AuditLog lesson.reset fehlgeschlagen', e); }
    }
    return NextResponse.json({ success: true, removed, completedLessons: user.completedLessons });
  } catch (e: unknown) {
    const err = e as { message?: string };
    return NextResponse.json({ success: false, error: 'Fehler beim Zurücksetzen', details: err?.message }, { status: 500 });
  }
}
