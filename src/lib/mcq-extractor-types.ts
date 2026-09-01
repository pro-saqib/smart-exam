export type MCQOptionLabel = "A" | "B" | "C" | "D" | "E";

export interface MCQExtractorRequest {
  sourceUrl: string;
  startPage: number;
  endPage: number;
}

export interface ExtractedMCQ {
  id: string;
  question: string;
  options: Array<{ label: MCQOptionLabel; text: string }>;
  correctLabel?: MCQOptionLabel;
  explanation?: string;
  sourceUrl: string;
  sourcePage: number;
  sourceTitle?: string;
}

export interface MCQExtractionResult {
  sourceUrl: string;
  startPage: number;
  endPage: number;
  extractedAt: number;
  items: ExtractedMCQ[];
  warnings?: string[];
}

export interface TestpointSubject {
  name: string;
  url: string;
}

export interface TestpointYearGroup {
  year: string;
  subjects: TestpointSubject[];
}

export interface TestpointExtractorFormValues {
  selectedYear: string;
  selectedSubject: string;
  startPage: number;
  endPage: number;
  maxPages: number;
}
