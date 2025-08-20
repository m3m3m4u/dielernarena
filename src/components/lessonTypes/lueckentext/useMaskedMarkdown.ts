import { useMemo } from 'react';
import type { Gap, Mode } from './types';

interface Params { masked:string; gaps: Gap[]; }
export function useMaskedMarkdown({ masked, gaps }: Params){
  const parts = useMemo(()=> masked.split(/(___\d+___)/g).filter(Boolean), [masked]);
  const gapIds = useMemo(()=> new Set(gaps.map(g=>g.id)), [gaps]);
  return { parts, gapIds };
}
