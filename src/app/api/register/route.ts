import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import User from "@/models/User";
import { hash } from "bcryptjs";

export async function POST(req: NextRequest) {
  await dbConnect();
  const { username, name, password, email, desiredRole } = await req.json();

  if (username === 'Kopernikus') {
    return NextResponse.json({ error: 'Dieser Benutzer ist reserviert.' }, { status: 403 });
  }

  if (!username || !name || !password) {
    return NextResponse.json({ error: "Alle Felder sind erforderlich." }, { status: 400 });
  }

  // Keine Selbst-Registrierung für reservierte Rollen
  const forbiddenNames = ['admin','administrator','teacher','lehrer','author'];
  if (forbiddenNames.includes(username.toLowerCase())) {
    return NextResponse.json({ error: 'Benutzername reserviert.' }, { status: 403 });
  }

  const existingUser = await User.findOne({ username });
  if (existingUser) {
    return NextResponse.json({ error: "Benutzername bereits vergeben." }, { status: 409 });
  }

  const hashedPassword = await hash(password, 10);
  let role: string = 'learner';
  if (desiredRole === 'author') role = 'pending-author';
  if (desiredRole === 'teacher') role = 'pending-teacher';

  const newUser = new User({
    username,
    name,
    password: hashedPassword,
    email: email || undefined,
    completedLessons: [],
    role
  });
  await newUser.save();

  return NextResponse.json({ message: "Registrierung erfolgreich.", rolePending: role.startsWith('pending-') ? role : undefined }, { status: 201 });
}
