import dbConnect from '@/lib/db';
import User from '@/models/User';
import bcrypt from 'bcryptjs';

(async () => {
  await dbConnect();
  const existing = await User.findOne({ username: 'Kopernikus' });
  if (existing) {
    console.log('Autor existiert bereits.');
    process.exit(0);
  }
  const hash = await bcrypt.hash('12345', 10);
  await User.create({ username: 'Kopernikus', name: 'Kopernikus', password: hash, role: 'author', completedLessons: [], stars: 0 });
  console.log('Autor Kopernikus erstellt.');
  process.exit(0);
})();
