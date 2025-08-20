import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import bcrypt from 'bcryptjs';

export async function POST() {
  await dbConnect();
  const desiredUsername = 'Kopernikus';
  const plainPassword = '12345';
  const existing = await User.findOne({ username: desiredUsername });
  const hash = await bcrypt.hash(plainPassword, 10);
  if (!existing) {
    await User.create({ username: desiredUsername, name: desiredUsername, password: hash, role: 'author', completedLessons: [], stars: 0 });
    return NextResponse.json({ success: true, created: true });
  }
  let changed = false;
  if (existing.role !== 'author') { existing.role = 'author'; changed = true; }
  // Passwort immer neu setzen um sicherzugehen
  existing.password = hash; changed = true;
  await existing.save();
  return NextResponse.json({ success: true, updated: changed, alreadyExists: true });
}
