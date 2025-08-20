import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import User from "@/models/User";

export async function GET(req: NextRequest) {
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username");
  if (!username) {
    return NextResponse.json({ error: "Kein Benutzername angegeben." }, { status: 400 });
  }
  const user = await User.findOne({ username });
  if (!user) {
    return NextResponse.json({ error: "Nutzer nicht gefunden." }, { status: 404 });
  }
  return NextResponse.json({ user });
}

export async function PATCH(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json();
    const { username, resetStars, resetLessons } = body;
    if (!username) {
      return NextResponse.json({ success: false, error: 'username fehlt' }, { status: 400 });
    }
    const user = await User.findOne({ username });
    if (!user) return NextResponse.json({ success: false, error: 'Nutzer nicht gefunden' }, { status: 404 });

    if (resetStars) user.stars = 0;
    if (resetLessons) user.completedLessons = [];
    await user.save();

    return NextResponse.json({ success: true, user });
  } catch (e) {
    console.error('PATCH /api/user Fehler', e);
    return NextResponse.json({ success: false, error: 'Update fehlgeschlagen' }, { status: 500 });
  }
}
