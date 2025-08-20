import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import IsostadtMap from '@/models/IsostadtMap';

// GET /api/arena/arenaCity?key=default
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get('key') || 'default';
    await dbConnect();
    const doc = await IsostadtMap.findOne({ key }).lean();
    if (!doc) return NextResponse.json({ success: true, exists: false, map: null });
    return NextResponse.json({ success: true, exists: true, n: doc.n, map: doc.map, lastModified: (doc as any).lastModified, balance: (doc as any).balance, stars: (doc as any).stars });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Fehler beim Laden' }, { status: 500 });
  }
}

// POST /api/arena/arenaCity  body: { key?: string, n: number, map: number[][][] }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const key = typeof body.key === 'string' && body.key.trim() ? body.key.trim() : 'default';
    const n = Number(body.n);
    const map = body.map as unknown;
    const lastModified = typeof body.lastModified === 'number' ? body.lastModified : undefined;
    const balance = typeof body.balance === 'number' ? body.balance : undefined;
    const stars = typeof body.stars === 'number' ? body.stars : undefined;
    if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ success: false, error: 'n ungültig' }, { status: 400 });
    if (!Array.isArray(map)) return NextResponse.json({ success: false, error: 'map fehlt/ungültig' }, { status: 400 });
    await dbConnect();
    const set: any = { n, map };
    if (typeof lastModified === 'number') set.lastModified = lastModified; else set.lastModified = Date.now();
    if (typeof balance === 'number') set.balance = balance;
    if (typeof stars === 'number') set.stars = stars;
    const updated = await IsostadtMap.findOneAndUpdate(
      { key },
      { $set: set },
      { new: true, upsert: true }
    ).lean();
    return NextResponse.json({ success: true, n: updated?.n, map: updated?.map });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Fehler beim Speichern' }, { status: 500 });
  }
}
