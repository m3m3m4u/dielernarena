export type MemoryCardKind = 'text' | 'image' | 'audio';
export interface MemorySide { kind: MemoryCardKind; value: string; }
export interface MemoryPair { a: MemorySide; b: MemorySide; }
export interface ParseMemoryResult { pairs: MemoryPair[]; errors: string[]; warnings: string[]; }

const IMAGE_REGEX = /\.(png|jpe?g|gif|webp)$/i;
const AUDIO_REGEX = /\.(mp3|wav|ogg|m4a)$/i;
const URL_REGEX = /^https?:\/\//i;

function detectKind(v: string): MemoryCardKind {
  const value = v.trim();
  if (IMAGE_REGEX.test(value) || (URL_REGEX.test(value) && /(png|jpe?g|gif|webp)(\?|$)/i.test(value))) return 'image';
  if (AUDIO_REGEX.test(value) || (URL_REGEX.test(value) && /(mp3|wav|ogg|m4a)(\?|$)/i.test(value))) return 'audio';
  return 'text';
}

export function parseMemory(raw: string, opts?: { maxPairs?: number }): ParseMemoryResult {
  const maxPairs = opts?.maxPairs ?? 8;
  const pairs: MemoryPair[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!raw || !raw.trim()) {
    errors.push('Keine Eingabe');
    return { pairs: [], errors, warnings };
  }
  const seen = new Set<string>();
  const lines = raw.split(/\n+/).map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    if (pairs.length >= maxPairs) { warnings.push('Maximale Paaranzahl erreicht'); break; }
    const line = lines[i];
    if (!line.includes('|')) { warnings.push(`Zeile ${i+1}: kein Trennstrich | gefunden`); continue; }
    const [leftRaw, rightRaw] = line.split('|');
    const left = (leftRaw||'').trim();
    const right = (rightRaw||'').trim();
    if (!left || !right) { warnings.push(`Zeile ${i+1}: unvollständiges Paar`); continue; }
    if (left.toLowerCase() === right.toLowerCase()) { warnings.push(`Zeile ${i+1}: beide Seiten identisch`); continue; }
    const key = `${left}:::${right}`.toLowerCase();
    if (seen.has(key)) { warnings.push(`Zeile ${i+1}: doppeltes Paar ignoriert`); continue; }
    seen.add(key);
    const a: MemorySide = { kind: detectKind(left), value: left };
    const b: MemorySide = { kind: detectKind(right), value: right };
    pairs.push({ a, b });
  }
  if (pairs.length < 4) errors.push('Mindestens 4 gültige Paare erforderlich');
  if (pairs.length > 8) errors.push('Maximal 8 Paare erlaubt');
  return { pairs, errors, warnings };
}
