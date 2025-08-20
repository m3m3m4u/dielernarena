import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/models/User';
// Wichtig: Modell registrieren, damit populate('class') funktioniert
import '@/models/TeacherClass';
import { isAdminRequest, rateLimit } from '@/lib/adminGuard';

const HAS_DB = !!process.env.MONGODB_URI;
const IS_PROD = process.env.NODE_ENV === 'production';

// Liste + Erstellen von speziellen Accounts (teacher, author Freigabe)
export async function GET(request: Request){
  try {
    if(!rateLimit(request, 'admin-users')) return NextResponse.json({ success:false, error:'Rate limit' }, { status:429 });

    // Dev-Fallback: ohne DB keine 500 werfen, sondern leere Liste liefern
    if(!HAS_DB && !IS_PROD){
      return NextResponse.json({ success:true, users: [], total: 0 });
    }

    await dbConnect();
    if(!(await isAdminRequest(request))) return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });

    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10)));

    // Kopernikus wird im JWT zu admin eskaliert; falls DB noch 'author', korrigieren wir das einmalig
    // Korrektur ggf. einmalig durchfuehren (idempotent)
    await User.updateOne({ username: 'Kopernikus', role: { $ne: 'admin' } }, { $set: { role: 'admin' } });

    // Wenn keine Suche: Paginierung und Total direkt in der DB (performanter)
    if(!q){
      const total = await User.countDocuments({});
      const pagedRaw = await User
        .find({}, 'username name role email ownerTeacher class createdAt updatedAt')
        .populate('ownerTeacher', 'username name')
        .populate('class', 'name')
        .sort({ createdAt:-1 })
        .skip((page-1)*pageSize)
        .limit(pageSize)
        .lean();
      const users = pagedRaw.map((u:any)=>({
        username: u.username,
        name: u.name,
        role: u.username === 'Kopernikus' ? 'admin' : u.role,
        email: u.email,
        createdAt: u.createdAt,
        ownerTeacherUsername: (u as any).ownerTeacher?.username,
        ownerTeacherName: (u as any).ownerTeacher?.name,
        className: (u as any).class?.name,
      }));
      return NextResponse.json({ success:true, users, total });
    }

    // Mit Suche: aktuelles Verhalten beibehalten (Filter auch ueber populate-Felder)
    const usersRaw = await User
      .find({}, 'username name role email ownerTeacher class createdAt updatedAt')
      .populate('ownerTeacher', 'username name')
      .populate('class', 'name')
      .sort({ createdAt:-1 })
      .lean();
    const matches = (u:any)=>{
      const hay = [u.username, u.name, u.email, (u as any).class?.name, (u as any).ownerTeacher?.username, (u as any).ownerTeacher?.name]
        .filter(Boolean)
        .map((s:string)=>String(s).toLowerCase());
      return hay.some((h:string)=>h.includes(q));
    };
    const filtered = usersRaw.filter(matches);
    const total = filtered.length;
    const paged = filtered.slice((page-1)*pageSize, page*pageSize);
    const users = paged.map((u:any)=>({
      username: u.username,
      name: u.name,
      role: u.username === 'Kopernikus' ? 'admin' : u.role,
      email: u.email,
      createdAt: u.createdAt,
      ownerTeacherUsername: (u as any).ownerTeacher?.username,
      ownerTeacherName: (u as any).ownerTeacher?.name,
      className: (u as any).class?.name,
    }));
    return NextResponse.json({ success:true, users, total });
  } catch (e: any) {
    const msg = typeof e?.message === 'string' ? e.message : 'Unknown';
    return NextResponse.json({ success:false, error:`Serverfehler: ${msg}` }, { status:500 });
  }
}

export async function POST(request: Request){
  try {
    if(!rateLimit(request, 'admin-users')) return NextResponse.json({ success:false, error:'Rate limit' }, { status:429 });
    if(!HAS_DB && !IS_PROD){
      return NextResponse.json({ success:false, error:'DB nicht konfiguriert (MONGODB_URI). Schreiben nicht möglich.' }, { status:503 });
    }
    await dbConnect();
    if(!(await isAdminRequest(request))) return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
    const body = await request.json().catch(()=>({}));
    const { username, name, password, email, makeRole } = body as any;
    if(!username || !name || !password || !makeRole) return NextResponse.json({ success:false, error:'Felder fehlen' }, { status:400 });
    if(!['author','teacher','admin'].includes(makeRole)) return NextResponse.json({ success:false, error:'Ungültige Rolle' }, { status:400 });
    const existing = await User.findOne({ username });
    if(existing) return NextResponse.json({ success:false, error:'Benutzer existiert' }, { status:409 });
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash(password,10);
    const user = await User.create({ username, name, password:hash, email: email||undefined, role: makeRole });
    return NextResponse.json({ success:true, user:{ id:String(user._id), username:user.username, role:user.role } });
  } catch (e: any) {
    const msg = typeof e?.message === 'string' ? e.message : 'Unknown';
    return NextResponse.json({ success:false, error:`Serverfehler: ${msg}` }, { status:500 });
  }
}

// Patch: Rolle ändern (pending-author -> author, etc.)
export async function PATCH(request: Request){
  try {
    if(!rateLimit(request, 'admin-users')) return NextResponse.json({ success:false, error:'Rate limit' }, { status:429 });
    if(!HAS_DB && !IS_PROD){
      return NextResponse.json({ success:false, error:'DB nicht konfiguriert (MONGODB_URI). Schreiben nicht möglich.' }, { status:503 });
    }
    await dbConnect();
    if(!(await isAdminRequest(request))) return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
    const body = await request.json().catch(()=>({}));
    const { username, newRole } = body as any;
    if(!username || !newRole) return NextResponse.json({ success:false, error:'Felder fehlen' }, { status:400 });
    if(!['author','teacher','admin','learner','pending-author','pending-teacher'].includes(newRole)) return NextResponse.json({ success:false, error:'Ungültige Rolle' }, { status:400 });
    const user = await User.findOneAndUpdate({ username }, { role:newRole }, { new:true });
    if(!user) return NextResponse.json({ success:false, error:'Benutzer nicht gefunden' }, { status:404 });
    return NextResponse.json({ success:true, user:{ username:user.username, role:user.role } });
  } catch (e: any) {
    const msg = typeof e?.message === 'string' ? e.message : 'Unknown';
    return NextResponse.json({ success:false, error:`Serverfehler: ${msg}` }, { status:500 });
  }
}

// Benutzer löschen
export async function DELETE(request: Request){
  try {
    if(!rateLimit(request, 'admin-users')) return NextResponse.json({ success:false, error:'Rate limit' }, { status:429 });
    if(!HAS_DB && !IS_PROD){
      return NextResponse.json({ success:false, error:'DB nicht konfiguriert (MONGODB_URI). Schreiben nicht möglich.' }, { status:503 });
    }
    await dbConnect();
    if(!(await isAdminRequest(request))) return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
    const body = await request.json().catch(()=>({}));
    const { username } = body as any;
    if(!username) return NextResponse.json({ success:false, error:'Username fehlt' }, { status:400 });
    const res = await User.deleteOne({ username });
    if(res.deletedCount === 0) return NextResponse.json({ success:false, error:'Benutzer nicht gefunden' }, { status:404 });
    return NextResponse.json({ success:true, deleted: username });
  } catch (e: any) {
    const msg = typeof e?.message === 'string' ? e.message : 'Unknown';
    return NextResponse.json({ success:false, error:`Serverfehler: ${msg}` }, { status:500 });
  }
}
