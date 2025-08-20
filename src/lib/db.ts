import mongoose from "mongoose";

// Hinweis: Zugriff auf ENV erst bei Verbindungsaufbau, damit Build auf Vercel
// nicht fehlschlägt, falls PREVIEW ohne DB-Env gebaut wird.
const getMongoUri = () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('[db] MONGODB_URI nicht gesetzt – Verbindung erst bei Aufruf fehlschlägt.');
  }
  return uri;
};

// Erweitere das global-Objekt um mongoose
declare global {
  var mongoose: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Mongoose> | null;
  } | undefined;
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function dbConnect() {
  if (cached!.conn) {
    return cached!.conn;
  }

  if (!cached!.promise) {
  const uri = getMongoUri();
  if (!uri) throw new Error('MONGODB_URI env fehlt');
  const opts = { bufferCommands: false };
  cached!.promise = mongoose.connect(uri, opts);
  }

  try {
    const mongooseInstance = await cached!.promise;
    cached!.conn = mongooseInstance.connection;
  } catch (e) {
    cached!.promise = null;
    throw e;
  }

  return cached!.conn;
}

export default dbConnect;
