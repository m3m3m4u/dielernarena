import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import Lesson from '@/models/Lesson';

// Normalisiert completedLessons Einträge: akzeptiert beide Formate (lessonId oder courseId-lessonId)
// Ziel: Ein einheitliches Format lessonId behalten (redundanzfrei)
// Optionaler Query ?dry=1 für Trockenlauf
export async function POST(req: NextRequest) {
  await dbConnect();
  const url = new URL(req.url);
  const dry = url.searchParams.get('dry') === '1';
  const users = await User.find({}).lean();
  const lessons = await Lesson.find({}).select('_id courseId').lean();
  const lessonMap = new Map<string, string>(); // lessonId -> courseId
  for (const l of lessons) {
    lessonMap.set(String(l._id), (l as any).courseId);
  }
  let affectedUsers = 0;
  const ops: Promise<any>[] = [];
  for (const u of users) {
    const arr = Array.isArray(u.completedLessons) ? u.completedLessons.slice() : [];
    if (!arr.length) continue;
    let changed = false;
    const normalized = new Set<string>();
    for (const entry of arr) {
      if (!entry || typeof entry !== 'string') continue;
      if (lessonMap.has(entry)) {
        normalized.add(entry); // bereits reines lessonId Format
        continue;
      }
      // mögliches courseId-lessonId
      const parts = entry.split('-');
      const maybeLessonId = parts[parts.length - 1];
      if (lessonMap.has(maybeLessonId)) {
        normalized.add(maybeLessonId);
        if (maybeLessonId !== entry) changed = true;
      } else {
        // Waisen-Eintrag -> verwerfen
        changed = true;
      }
    }
    if (changed) {
      affectedUsers++;
      if (!dry) {
        ops.push(User.updateOne({ _id: u._id }, { $set: { completedLessons: Array.from(normalized) } }));
      }
    }
  }
  if (!dry && ops.length) await Promise.all(ops);
  return NextResponse.json({ success: true, affectedUsers, dryRun: dry });
}
