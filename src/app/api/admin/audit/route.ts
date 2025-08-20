import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import AuditLog from '@/models/AuditLog';

// GET /api/admin/audit?action=lesson.create&user=Kopernikus&limit=50
export async function GET(req: NextRequest) {
  await dbConnect();
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || undefined;
  const user = url.searchParams.get('user') || undefined;
  const targetType = url.searchParams.get('targetType') || undefined;
  const targetId = url.searchParams.get('targetId') || undefined;
  const courseId = url.searchParams.get('courseId') || undefined;
  const limit = Math.min(Number(url.searchParams.get('limit') || '50'), 200);
  const since = url.searchParams.get('since'); // ISO Date optional

  const filter: Record<string, unknown> = {};
  if (action) filter.action = action;
  if (user) filter.user = user;
  if (targetType) filter.targetType = targetType;
  if (targetId) filter.targetId = targetId;
  if (courseId) filter.courseId = courseId;
  if (since) {
    const d = new Date(since);
    if (!isNaN(d.getTime())) filter.createdAt = { $gte: d };
  }

  const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  return NextResponse.json({ success: true, count: logs.length, logs });
}

// POST minimal: { action, user, targetType, targetId, courseId, meta }
export async function POST(req: NextRequest) {
  await dbConnect();
  const body = await req.json();
  const { action, user, targetType, targetId, courseId, meta } = body || {};
  if (!action) return NextResponse.json({ success: false, error: 'action fehlt' }, { status: 400 });
  try {
    const log = await AuditLog.create({ action, user, targetType, targetId, courseId, meta });
    return NextResponse.json({ success: true, logId: String(log._id) });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: 'Speichern fehlgeschlagen', details: e?.message }, { status: 500 });
  }
}
