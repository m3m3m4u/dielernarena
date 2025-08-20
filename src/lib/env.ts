// Zentralisierte ENV Validierung für Vercel / lokal
// Nur Variablen definieren die wirklich benötigt werden – optional markiert.
interface EnvShape {
  MONGODB_URI: string;
  NEXTAUTH_SECRET?: string; // sollte in Produktion gesetzt sein
  NEXTAUTH_URL?: string;
}

function required(name: keyof EnvShape, fallback?: string) {
  const v = process.env[name as string] ?? fallback;
  if (!v) {
    console.warn(`[env] Variable ${name} fehlt – Feature evtl. eingeschränkt.`);
  }
  return v as string;
}

export const env: EnvShape = {
  MONGODB_URI: required('MONGODB_URI'),
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
};

export function assertProductionEnv() {
  if (process.env.NODE_ENV === 'production') {
    const missing: string[] = [];
    if (!env.MONGODB_URI) missing.push('MONGODB_URI');
    if (!env.NEXTAUTH_SECRET) missing.push('NEXTAUTH_SECRET');
    if (missing.length) {
      console.warn('[env] Fehlende Produktions-Variablen:', missing.join(', '));
    }
  }
}
