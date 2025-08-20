// Zentrale Kategorienliste für Client und Server (alphabetisch)
export const CATEGORIES = [
  'Berufsorientierung',
  'Biologie',
  'Chemie',
  'Deutsch',
  'Deutsch als Zweitsprache',
  'Englisch',
  'Ernährung und Hauswirtschaft',
  'Französisch',
  'Geographie',
  'Geschichte',
  'Informatik',
  'Italienisch',
  'Kunst',
  'Latein',
  'Mathematik',
  'Medien',
  'Musik',
  'Philosophie',
  'Physik',
  'Politik',
  'Psychologie',
  'Sachunterricht',
  'Sozialkunde',
  'Spanisch',
  'Technik',
  'Türkisch',
  'Umwelt und Klima',
  'Wirtschaft',
  'sonstiges'
] as const;

export type Category = typeof CATEGORIES[number];

// Case-insensitive Normalisierung
export function normalizeCategory(input?: string | null): Category | undefined {
  if (!input) return undefined;
  const v = String(input).trim();
  if (!v) return undefined;
  const found = CATEGORIES.find(c => c.toLowerCase() === v.toLowerCase());
  return found as Category | undefined;
}

export function isAllowedCategory(input?: string | null): input is Category {
  return !!normalizeCategory(input);
}
