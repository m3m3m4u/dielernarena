// Gemeinsame Typen für Flugzeug-Spiel
export const LOGICAL_WIDTH = 960;
export const LOGICAL_HEIGHT = 540;
export const TOP_SAFE_ZONE = 45;

export interface QuestionBlock { question: string; answers: string[]; correct: number }

export interface Cloud {
  id?: number; // eindeutige ID für Kollision-Guards
  text: string;
  correct: boolean;
  lane: number;
  x: number; y: number; w: number; h: number; speed: number;
  hit: boolean; alpha: number; qid: number; pop: number; active: boolean; persistent: boolean;
  fontSize: number; lines: string[] | null; lineHeight: number; prevX?: number; hitTime?: number;
  lifePenalized?: boolean; // verhindert mehrfachen Herzabzug pro Wolke
}
