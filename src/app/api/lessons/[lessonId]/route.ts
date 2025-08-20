import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Lesson from "@/models/Lesson";
import Course from "@/models/Course";
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';

// Next.js 15: params muss awaited werden
export async function GET(request: Request, context: { params: Promise<{ lessonId: string }> }) {
  try {
    const { lessonId } = await context.params;
    await dbConnect();
    const lesson = await Lesson.findById(lessonId);
    if (!lesson) return NextResponse.json({ error: "Lektion nicht gefunden" }, { status: 404 });
    return NextResponse.json({ success: true, lesson });
  } catch (error) {
    console.error("Fehler beim Laden der Lektion:", error);
    return NextResponse.json({ error: "Fehler beim Laden der Lektion" }, { status: 500 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ lessonId: string }> }) {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 });
    const { lessonId } = await context.params;
    const lesson = await Lesson.findById(lessonId);
    if (!lesson) return NextResponse.json({ error: 'Lektion nicht gefunden' }, { status: 404 });
    const course = await Course.findById(lesson.courseId).lean();
    if (!course) return NextResponse.json({ error: 'Kurs nicht gefunden' }, { status: 404 });
    const userRole = (session.user as any).role;
    const username = (session.user as any).username;
    const isOwnerTeacher = userRole === 'teacher' && (course as any).author === username;
  if (!isOwnerTeacher && userRole !== 'author' && userRole !== 'admin') {
      return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 });
    }
    const body = await request.json();
    const { title, content } = body as { title?: unknown; content?: unknown };
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) update.title = String(title);
    if (content !== undefined) update.content = content;
    const updated = await Lesson.findByIdAndUpdate(lessonId, update, { new: true });
    if (!updated) return NextResponse.json({ error: 'Update fehlgeschlagen' }, { status: 500 });
    const res = NextResponse.json({ success: true, lesson: updated });
    res.headers.set('Warning', '299 - Eingeschränkter Legacy Endpoint, bitte Kurs-spezifische Lektionen-Route verwenden');
    return res;
  } catch (error) {
    console.error('Fehler beim Aktualisieren der Lektion:', error);
    return NextResponse.json({ error: 'Fehler beim Aktualisieren der Lektion' }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ lessonId: string }> }) {
  try {
    const { lessonId } = await context.params;
    await dbConnect();
    // Auth + Besitzprüfung
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 });
  const role = (session.user as any).role;
  const username = (session.user as any).username;
  const existing = await Lesson.findById(lessonId);
    if (!existing) return NextResponse.json({ error: "Lektion nicht gefunden" }, { status: 404 });
  if (role !== 'admin' && role !== 'author') {
      // Owner-Teacher darf löschen
      const course = await Course.findById(existing.courseId).lean();
      if (!(role === 'teacher' && course && (course as any).author === username)) {
      return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 });
      }
    }
    const deletedLesson = await Lesson.findByIdAndDelete(lessonId);
    if (!deletedLesson) return NextResponse.json({ error: "Lektion nicht gefunden" }, { status: 404 });
    return NextResponse.json({ success: true, message: "Lektion erfolgreich gelöscht" });
  } catch (error) {
    console.error("Fehler beim Löschen der Lektion:", error);
    return NextResponse.json({ error: "Fehler beim Löschen der Lektion" }, { status: 500 });
  }
}
