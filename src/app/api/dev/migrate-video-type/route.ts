import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import Lesson from '@/models/Lesson';
import dbConnect from '@/lib/db';

export async function POST() {
  try {
  await dbConnect();
  const session = await getServerSession(authOptions as any);
    if (!session || !(session as any).user?.isAdmin) {
      return NextResponse.json({ success: false, error: 'Nicht autorisiert' }, { status: 401 });
    }
    const res: any = await (Lesson as any).updateMany({ type: 'erklaerivdeo' }, { $set: { type: 'video' } });
    return NextResponse.json({ success: true, matched: res.matchedCount, modified: res.modifiedCount });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message || 'Fehler' }, { status: 500 });
  }
}
