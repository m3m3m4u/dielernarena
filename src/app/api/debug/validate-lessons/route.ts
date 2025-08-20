import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/db';
import Lesson from '@/models/Lesson';

const ALLOWED_TYPES = ["text","single-choice","multiple-choice","video","markdown","matching","memory","lueckentext","ordering","text-answer","snake"] as const;
const YT_REGEX = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i;

export async function GET() {
  await dbConnect();
  const session = await getServerSession(authOptions as any);
  if (!session || !(session as any).user?.isAdmin) {
    return NextResponse.json({ success: false, error: 'Nicht autorisiert' }, { status: 401 });
  }
  const result: any = {};
  const total = await Lesson.countDocuments({});
  result.total = total;
  const distinctTypes: string[] = await (Lesson as any).distinct('type');
  result.distinctTypes = distinctTypes;
  const counts: Record<string, number> = {};
  for (const t of distinctTypes) {
    counts[t] = await Lesson.countDocuments({ type: t });
  }
  result.counts = counts;
  const invalidTypeDocs = await Lesson.find({ type: { $nin: ALLOWED_TYPES } }).select('_id type title').lean();
  result.invalidTypeCount = invalidTypeDocs.length;
  result.invalidTypeSamples = invalidTypeDocs.slice(0,20);
  const videoIssues = await Lesson.find({ type: 'video', $or: [ { 'content.youtubeUrl': { $exists: false } }, { 'content.youtubeUrl': '' } ] }).select('_id title content.youtubeUrl').lean();
  result.videoMissingUrl = videoIssues.length;
  const videoBadFormat = await Lesson.find({ type: 'video', 'content.youtubeUrl': { $exists: true, $ne: '' } }).select('_id title content.youtubeUrl').lean() as any[];
  const badFmt = videoBadFormat.filter(v => !YT_REGEX.test(v.content?.youtubeUrl || ''));
  result.videoBadFormat = badFmt.slice(0,20);
  const legacy = await Lesson.find({ type: 'erklaerivdeo' }).countDocuments();
  result.legacyErklaerivdeo = legacy;
  return NextResponse.json({ success: true, ...result });
}
