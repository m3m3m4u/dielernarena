import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
const BLOB_PREFIX = 'uploads/';
const useBlob = !!process.env.VERCEL || !!process.env.BLOB_READ_WRITE_TOKEN;

async function ensureUploadsDir(){
  try { await fsp.mkdir(uploadsDir, { recursive: true }); } catch {}
}

// Hilfsimport, um '@vercel/blob' vollständig dynamisch und für den Bundler unsichtbar zu laden
async function importVercelBlob() {
  const importer: any = Function('m', 'return import(m)');
  const modName = String.fromCharCode(64) + 'vercel' + '/' + 'blob';
  return importer(modName);
}

export async function GET(){
  if(useBlob){
    try{
      const { list } = await importVercelBlob();
      const res = await list({ prefix: BLOB_PREFIX });
  const items: Array<{ name: string; url: string; size: number; mtime: number; key?: string }> = (res.blobs || []).map((b:any) => ({
        name: b.pathname?.replace(BLOB_PREFIX,'') || b.url.split('/').pop(),
        url: b.url,
        size: b.size || 0,
        mtime: new Date(b.uploadedAt || b.addedAt || Date.now()).getTime(),
        key: b.pathname || undefined,
  })).sort((a: {mtime:number}, b: {mtime:number})=> b.mtime - a.mtime);
      return NextResponse.json({ success:true, items });
    }catch(e:any){
      return NextResponse.json({ success:false, error: String(e?.message||e) }, { status:500 });
    }
  }
  await ensureUploadsDir();
  const items: Array<{ name: string; url: string; size: number; mtime: number; key?: string }>=[];
  try{
    const entries = await fsp.readdir(uploadsDir, { withFileTypes: true });
    for(const ent of entries){
      if(!ent.isFile()) continue;
      const full = path.join(uploadsDir, ent.name);
      const st = await fsp.stat(full).catch(()=>null);
      if(!st) continue;
      items.push({ name: ent.name, url: `/uploads/${encodeURIComponent(ent.name)}` , size: st.size, mtime: st.mtimeMs, key: BLOB_PREFIX + ent.name });
    }
    items.sort((a,b)=> b.mtime - a.mtime);
    return NextResponse.json({ success:true, items });
  }catch(e:any){
    return NextResponse.json({ success:false, error: String(e?.message||e) }, { status:500 });
  }
}

export async function POST(req: NextRequest){
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string | undefined;
  if(!role || (role !== 'author' && role !== 'admin')){
    return NextResponse.json({ success:false, error:'Forbidden' }, { status:403 });
  }
  try{
    const form = await req.formData();
    const file = form.get('file');
    if(!file || !(file instanceof Blob)){
      return NextResponse.json({ success:false, error:'Keine Datei übermittelt' }, { status:400 });
    }
    const nameFromForm = (form.get('filename') as string | null) || (file as any).name || 'upload.bin';
    const safeName = path.basename(nameFromForm).replace(/[^a-zA-Z0-9._-]/g, '_');
    if(useBlob){
  const { list, put } = await importVercelBlob();
      // Duplikatprüfung
      const existing = await list({ prefix: BLOB_PREFIX + safeName });
      if(existing?.blobs?.some((b:any)=> (b.pathname===BLOB_PREFIX+safeName) )){
        return NextResponse.json({ success:false, error:'Dateiname existiert bereits' }, { status:409 });
      }
      const arrayBuffer = await (file as Blob).arrayBuffer();
      const res = await put(BLOB_PREFIX + safeName, new Uint8Array(arrayBuffer), { access: 'public', addRandomSuffix: false, contentType: (file as any).type || undefined });
      return NextResponse.json({ success:true, name: safeName, url: res.url, key: res.pathname || (BLOB_PREFIX + safeName) });
    }
    await ensureUploadsDir();
    const dest = path.join(uploadsDir, safeName);
    if(fs.existsSync(dest)){
      return NextResponse.json({ success:false, error:'Dateiname existiert bereits' }, { status:409 });
    }
    const arrayBuffer = await (file as Blob).arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fsp.writeFile(dest, buffer);
    return NextResponse.json({ success:true, name: safeName, url: `/uploads/${encodeURIComponent(safeName)}`, key: BLOB_PREFIX + safeName });
  }catch(e:any){
    return NextResponse.json({ success:false, error: String(e?.message||e) }, { status:500 });
  }
}

export async function DELETE(req: NextRequest){
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string | undefined;
  if(!role || (role !== 'author' && role !== 'admin')){
    return NextResponse.json({ success:false, error:'Forbidden' }, { status:403 });
  }
  try{
    const { searchParams } = new URL(req.url);
    let name = searchParams.get('name') || '';
    let key = searchParams.get('key') || '';
    if(!name){
      const body = await req.json().catch(()=>({}));
      name = body?.name || '';
      key = body?.key || key;
    }
    if(useBlob){
  const { list, del } = await importVercelBlob();
      let url: string | undefined;
      if(key){
        const l = await list({ prefix: key });
        const hit = l?.blobs?.find((b:any)=> b.pathname===key);
        url = hit?.url;
      } else if(name){
        const l = await list({ prefix: BLOB_PREFIX + name });
        const hit = l?.blobs?.find((b:any)=> b.pathname===BLOB_PREFIX+name);
        url = hit?.url;
      }
      if(!url) return NextResponse.json({ success:false, error:'Nicht gefunden' }, { status:404 });
      await del(url);
      return NextResponse.json({ success:true });
    }
    await ensureUploadsDir();
    if(!name) return NextResponse.json({ success:false, error:'name fehlt' }, { status:400 });
    const safeName = path.basename(String(name));
    const target = path.join(uploadsDir, safeName);
    if(!fs.existsSync(target)) return NextResponse.json({ success:false, error:'Nicht gefunden' }, { status:404 });
    await fsp.unlink(target);
    return NextResponse.json({ success:true });
  }catch(e:any){
    return NextResponse.json({ success:false, error:String(e?.message||e) }, { status:500 });
  }
}

export async function PATCH(req: NextRequest){
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string | undefined;
  if(!role || (role !== 'author' && role !== 'admin')){
    return NextResponse.json({ success:false, error:'Forbidden' }, { status:403 });
  }
  try{
    const body = await req.json().catch(()=>({}));
    const name = String(body?.name || '');
    const newName = String(body?.newName || '');
    if(!name || !newName) return NextResponse.json({ success:false, error:'name und newName erforderlich' }, { status:400 });
    const safeOld = path.basename(name);
    const safeNew = path.basename(newName).replace(/[^a-zA-Z0-9._-]/g, '_');
    if(useBlob){
  const { list, put, del } = await importVercelBlob();
      const oldKey = BLOB_PREFIX + safeOld;
      const newKey = BLOB_PREFIX + safeNew;
      const exists = await list({ prefix: newKey });
      if(exists?.blobs?.some((b:any)=> b.pathname===newKey)){
        return NextResponse.json({ success:false, error:'Dateiname existiert bereits' }, { status:409 });
      }
      const l = await list({ prefix: oldKey });
      const hit = l?.blobs?.find((b:any)=> b.pathname===oldKey);
      if(!hit?.url) return NextResponse.json({ success:false, error:'Nicht gefunden' }, { status:404 });
      // Inhalt holen und neu hochladen
      const resp = await fetch(hit.url);
      if(!resp.ok) return NextResponse.json({ success:false, error:'Inhalt konnte nicht gelesen werden' }, { status:500 });
      const arrayBuffer = await resp.arrayBuffer();
      await put(newKey, new Uint8Array(arrayBuffer), { access: 'public', addRandomSuffix: false, contentType: resp.headers.get('content-type') || undefined });
      await del(hit.url);
      return NextResponse.json({ success:true, name: safeNew, url: hit.url.replace(safeOld, safeNew), key: newKey });
    }
    await ensureUploadsDir();
    const oldPath = path.join(uploadsDir, safeOld);
    const newPath = path.join(uploadsDir, safeNew);
    if(!fs.existsSync(oldPath)) return NextResponse.json({ success:false, error:'Nicht gefunden' }, { status:404 });
    if(fs.existsSync(newPath)) return NextResponse.json({ success:false, error:'Dateiname existiert bereits' }, { status:409 });
    await fsp.rename(oldPath, newPath);
    return NextResponse.json({ success:true, name: safeNew, url: `/uploads/${encodeURIComponent(safeNew)}`, key: BLOB_PREFIX + safeNew });
  }catch(e:any){
    return NextResponse.json({ success:false, error:String(e?.message||e) }, { status:500 });
  }
}
