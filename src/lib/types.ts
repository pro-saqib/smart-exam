export type Difficulty = "easy" | "medium" | "hard";

export interface MCQ {
  id: string;
  subjectId: string;
  question: string;
  options: { A: string; B: string; C: string; D: string; E?: string };
  correct?: "A" | "B" | "C" | "D" | "E";
  explanation?: string;
  difficulty?: Difficulty;
  tags?: string[];
  attemptCount: number;
  wrongCount: number;
  lastAttemptCorrect?: boolean;
  solveLater: boolean;
  createdAt: number;
}

export interface Subject {
  id: string;
  name: string;
  color?: string;
  createdAt: number;
}

export interface AttemptLog {
  id: string;
  mcqId: string;
  subjectId: string;
  selected: "A" | "B" | "C" | "D" | "E";
  correct: boolean;
  at: number;
}
