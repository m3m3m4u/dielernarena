import { useState, useMemo } from 'react';
import type { Gap, Mode } from './types';

interface Params { gaps: Gap[]; mode: Mode; }
export function useGapState({ gaps, mode }: Params){
  const [answersState, setAnswersState] = useState<Record<number,string>>(()=>({}));
  const [checked, setChecked] = useState(false);
  const [correctAll, setCorrectAll] = useState(false);
  const [usedAnswers, setUsedAnswers] = useState<string[]>([]);
  const [focusGap, setFocusGap] = useState<number|null>(null);

  const allFilled = useMemo(()=> gaps.every(g=> (answersState[g.id]||'').trim().length>0), [answersState, gaps]);

  const resetChecked = ()=> { setChecked(false); };

  return { answersState, setAnswersState, checked, setChecked, correctAll, setCorrectAll, usedAnswers, setUsedAnswers, focusGap, setFocusGap, allFilled, resetChecked };
}
