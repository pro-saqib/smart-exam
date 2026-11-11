
    PRAGMA foreign_keys = OFF;
    DELETE FROM attempt;
    DELETE FROM solve_later;
    DELETE FROM paper_completion;
    DELETE FROM mcq;
    DELETE FROM subject;
    PRAGMA foreign_keys = ON;
  