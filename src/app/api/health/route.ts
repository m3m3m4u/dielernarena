import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // keine Cache Probleme

export async function GET() {
  return NextResponse.json({ ok: true, time: new Date().toISOString() });
}
