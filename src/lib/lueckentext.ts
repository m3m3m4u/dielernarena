export interface LueckentextGap {
  id: number;            // laufende Nummer ab 1
  answer: string;        // korrekte Lösung (Original aus *...*)
  placeholder: string;   // Platzhalter im Masked Markdown (___1___)
  index: number;         // Startindex des Match im Original (für evtl. spätere Features)
}

export interface ParsedLueckentext {
  markdownOriginal: string;          // Original mit *Antworten*
  markdownMasked: string;            // Mit Platzhaltern ersetzt
  gaps: LueckentextGap[];            // Extrahierte Lücken
  mode: 'input' | 'drag';            // Interaktions-Modus
}

export interface ParseResult { parsed?: ParsedLueckentext; errors: string[]; warnings: string[]; }

// Parser: Antworten sind *wort oder phrase* (kein Zeilenumbruch). Escaped \* wird ignoriert.
// Ersetzt jede gefundene Antwort durch ___n___ (n = 1..k)
export function parseLueckentext(markdown: string, mode: 'input' | 'drag' = 'input'): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (typeof markdown !== 'string' || !markdown.trim()) {
    errors.push('Kein Markdown angegeben');
    return { errors, warnings };
  }
  const original = markdown;
  const gaps: LueckentextGap[] = [];

  // Manuelles Scannen für *Antwort* mit Escape-Unterstützung (\\*)
  let masked = '';
  let i = 0;
  let gapIndex = 0;
  while (i < original.length) {
    const ch = original[i];
    if (ch === '*') {
      // Prüfen ob escaped (vorheriges Zeichen ist backslash und nicht escaped selbst)
      const prev = original[i - 1];
      let escaped = false;
      if (prev === '\\') {
        // zähle Backslashes vor *
        let backCount = 0; let k = i - 1;
        while (k >= 0 && original[k] === '\\') { backCount++; k--; }
        escaped = backCount % 2 === 1;
      }
      if (escaped) {
        masked += '*';
        i += 1;
        continue;
      }
      // Öffnenden Stern gefunden -> nach schließendem suchen
      let j = i + 1;
      let content = '';
      let found = false;
      while (j < original.length) {
        const cj = original[j];
        if (cj === '*') {
          // prüfen ob escaped
            const prev2 = original[j - 1];
            let escaped2 = false;
            if (prev2 === '\\') {
              let backCount2 = 0; let k2 = j - 1;
              while (k2 >= 0 && original[k2] === '\\') { backCount2++; k2--; }
              escaped2 = backCount2 % 2 === 1;
            }
            if (!escaped2) { found = true; break; }
        }
        content += cj;
        j++;
      }
      if (found) {
        const answer = content.trim();
        if (!answer) {
          warnings.push(`Leere Lücke bei Index ${i}`);
          masked += original.slice(i, j + 1); // Original behalten
        } else {
          gapIndex += 1;
          const placeholder = `___${gapIndex}___`;
          masked += placeholder;
          gaps.push({ id: gapIndex, answer, placeholder, index: i });
        }
        i = j + 1;
        continue;
      } else {
        // Kein schließender Stern -> als normaler Stern übernehmen
        masked += '*';
        i += 1;
        continue;
      }
    }
    masked += ch;
    i += 1;
  }

  if (gaps.length === 0) errors.push('Keine *Antworten* gefunden');
  if (gaps.length > 100) warnings.push('Sehr viele Lücken – Performance kann leiden');

  if (errors.length) return { errors, warnings };
  return { errors, warnings, parsed: { markdownOriginal: original, markdownMasked: masked, gaps, mode } };
}
