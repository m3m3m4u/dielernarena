import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import User from "@/models/User";
import Lesson from "@/models/Lesson";
import AuditLog from "@/models/AuditLog";

export async function POST(req: NextRequest) {
  await dbConnect();
  const { username, lessonId, courseId, earnedStar: clientEarnedStar } = await req.json();

  if (!username || !lessonId) {
    return NextResponse.json({ error: "Username und LessonId erforderlich." }, { status: 400 });
  }

  const user = await User.findOne({ username });
  if (!user) {
    return NextResponse.json({ error: "Nutzer nicht gefunden." }, { status: 404 });
  }

  // Normalisiertes Ziel-Format: nur lessonId speichern
  const keyNew = String(lessonId);
  // Alte Form ggf. noch vorhanden
  const legacyKey = courseId ? `${courseId}-${lessonId}` : undefined;
  const alreadyCompleted = user.completedLessons.includes(keyNew) || (legacyKey ? user.completedLessons.includes(legacyKey) : false);
  if (!alreadyCompleted) {
    user.completedLessons.push(keyNew);
  } else if (legacyKey && user.completedLessons.includes(legacyKey) && !user.completedLessons.includes(keyNew)) {
    // Migration: legacy durch neues Format ersetzen
    user.completedLessons = user.completedLessons.filter(k => k !== legacyKey);
    user.completedLessons.push(keyNew);
  }

  // Lesson laden (Typ nötig für server-seitige Sternentscheidung)
  let lesson: { _id: any; type?: string } | null = null;
  try {
    lesson = await Lesson.findById(lessonId).select('_id type').lean();
  } catch {
    // ignorieren – wenn nicht gefunden, kein Stern
  }

  // Server-seitige Policy: Welche Typen dürfen Sterne liefern?
  // Ausnahmen (kein Stern): 'markdown' = reiner Informationstext, 'text' (falls als Info genutzt)
  const STAR_TYPES = new Set([
    'single-choice',
    'multiple-choice',
    'matching',
    'memory',
    'lueckentext',
    'ordering',
    'text-answer',
    'video',
  'minigame',
  'snake'
  ]);

  // Entscheidung unabhängig vom Client-Flag (clientEarnedStar nur fürs Audit protokolliert)
  let starGranted = false;
  const eligible = !alreadyCompleted && lesson && lesson.type && STAR_TYPES.has(lesson.type);
  if (eligible) {
    if (!user.stars) user.stars = 0;
    user.stars += 1;
    starGranted = true;
  }

  await user.save();

  // Audit protokollieren (Fehler ignorieren, um Completion nicht zu blockieren)
  try {
    await AuditLog.create({
      action: 'lesson.complete',
      user: username,
      targetType: 'lesson',
      targetId: String(lessonId),
      courseId: courseId ? String(courseId) : undefined,
  meta: { clientEarnedStar: !!clientEarnedStar, computedEligible: !!eligible, granted: starGranted, lessonType: lesson?.type }
    });
  } catch (e) { console.warn('AuditLog lesson.complete fehlgeschlagen', e); }

  return NextResponse.json({ 
    message: "Lektion abgeschlossen!", 
  earnedStar: starGranted,
    totalStars: user.stars || 0,
    alreadyCompleted
  });
}
