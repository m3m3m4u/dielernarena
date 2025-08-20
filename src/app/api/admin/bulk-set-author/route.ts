import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Course from '@/models/Course';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';

// Setzt nachträglich den Autor aller Kurse auf einen gewünschten Namen.
// Nutzung: POST /api/admin/bulk-set-author  mit optionalem JSON { author: "Name" }
export async function POST(request: Request){
  try {
    await dbConnect();
  // Auth + Rollencheck (nur author oder admin Rolle)
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if(!user) return NextResponse.json({ success:false, error:'Nicht authentifiziert' }, { status:401 });
  const role = user.role;
  if(role !== 'author' && role !== 'admin') return NextResponse.json({ success:false, error:'Keine Berechtigung' }, { status:403 });
    let desired = 'Kopernikus';
    try {
      const body = await request.json().catch(()=>null) as any;
      if (body && typeof body.author === 'string' && body.author.trim()) desired = body.author.trim();
    } catch { /* ignore body errors */ }
    const res = await Course.updateMany({}, { $set: { author: desired } });
  const response = NextResponse.json({ success: true, matched: (res as any).matchedCount, modified: (res as any).modifiedCount, author: desired });
  response.headers.set('Warning','299 - Admin Bulk Operation – Endpoint danach entfernen oder absichern');
  return response;
  } catch (e) {
    console.error('bulk-set-author Fehler', e);
    return NextResponse.json({ success: false, error: 'Fehler beim Aktualisieren' }, { status: 500 });
  }
}
