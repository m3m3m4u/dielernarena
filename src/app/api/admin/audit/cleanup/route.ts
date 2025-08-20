import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import AuditLog from '@/models/AuditLog';

// DELETE /api/admin/audit/cleanup?days=90  -> löscht Logs älter als X Tage (default 90)
export async function DELETE(req: NextRequest) {
  await dbConnect();
  const url = new URL(req.url);
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get('days') || '90')));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const { deletedCount } = await AuditLog.deleteMany({ createdAt: { $lt: cutoff } });
  return NextResponse.json({ success: true, deleted: deletedCount, olderThanDays: days });
}
