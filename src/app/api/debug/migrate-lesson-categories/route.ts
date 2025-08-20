import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Lesson from '@/models/Lesson';
import Course from '@/models/Course';

/*
  Migration: fehlende Lesson.category nachtragen.
  - Falls courseId != 'exercise-pool': Kategorie aus zugehörigem Kurs übernehmen.
  - Falls Standalone (exercise-pool) und body.defaultCategory gesetzt -> diese verwenden.
  GET führt eine Dry-Run Analyse aus (liefert counts & sample IDs ohne Änderungen).
  POST wendet Migration an.
*/

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const lessons = await Lesson.find({ $or: [{ category: { $exists: false } }, { category: null }, { category: '' }] }).lean();
    const total = lessons.length;
    const byCourse: Record<string, number> = {};
    lessons.forEach(l => { byCourse[l.courseId] = (byCourse[l.courseId] || 0) + 1; });
    return NextResponse.json({ success: true, mode: 'dry-run', total, byCourse, sample: lessons.slice(0,10).map(l=>({id: l._id, courseId: l.courseId})) });
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Analyse fehlgeschlagen' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json().catch(()=>({}));
    const defaultCategory = typeof body.defaultCategory === 'string' ? body.defaultCategory.trim() : undefined;

    const lessons = await Lesson.find({ $or: [{ category: { $exists: false } }, { category: null }, { category: '' }] });
    let updated = 0;
    for (const lesson of lessons) {
      if (lesson.courseId && lesson.courseId !== 'exercise-pool') {
        try {
          const course = await Course.findById(lesson.courseId).lean();
          if (course?.category) {
            (lesson as any).category = course.category;
            await lesson.save();
            updated++;
            continue;
          }
        } catch { /* ignore single failure */ }
      }
      if (!lesson.category && defaultCategory) {
        (lesson as any).category = defaultCategory;
        await lesson.save();
        updated++;
      }
    }
    return NextResponse.json({ success: true, updated, remaining: await Lesson.countDocuments({ $or: [{ category: { $exists: false } }, { category: null }, { category: '' }] }) });
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Migration fehlgeschlagen' }, { status: 500 });
  }
}
