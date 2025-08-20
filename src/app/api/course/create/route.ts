import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Course from "@/models/Course";
import { CATEGORIES as ALLOWED_CATEGORIES, normalizeCategory } from '@/lib/categories';

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json();
  const { title, description, category, tags = [], author: authorFromBody, progressionMode } = body;

    if (!title || !description || !category) {
      return NextResponse.json({ success: false, error: 'Titel, Beschreibung und Kategorie sind erforderlich' }, { status: 400 });
    }

    const catStr = String(category).trim();
  const normalizedCategory = normalizeCategory(catStr);
  if (!normalizedCategory) {
      return NextResponse.json({ success: false, error: `Ungültige Kategorie: ${catStr}` }, { status: 400 });
    }

    const author = authorFromBody || 'guest';

    const mode = progressionMode === 'linear' ? 'linear' : 'free';
    const newCourse = await Course.create({
      title: String(title).trim(),
      description: String(description).trim(),
      category: normalizedCategory,
      tags,
      author,
      lessons: [],
      isPublished: false,
      progressionMode: mode
    });

    return NextResponse.json({ success: true, courseId: newCourse.id, course: newCourse });
  } catch (error) {
    console.error('Fehler beim Erstellen des Kurses:', error);
    return NextResponse.json({ success: false, error: 'Fehler beim Erstellen des Kurses' }, { status: 500 });
  }
}
