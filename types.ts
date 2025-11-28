
export enum AssessmentCategory {
  REASONING = 'Reasoning',
  PERCEPTUAL_SPEED = 'Perceptual Speed',
  NUMBER_SPEED = 'Number Speed & Accuracy',
  WORD_MEANING = 'Word Meaning',
  SPATIAL_VISUALIZATION = 'Spatial Visualization'
}

export type AssessmentPhase = 'intro' | 'instructions' | 'test' | 'analysis' | 'history';

export interface Question {
  id: string;
  category: AssessmentCategory;
  
  // Common
  correctAnswer: string;
  timeLimitSeconds: number;
  
  // Reasoning Data
  reasoningStatement?: string;
  reasoningQuestion?: string;
  reasoningOptions?: string[];
  
  // Perceptual Data
  perceptualPairs?: string[][]; // e.g. [['E', 'e'], ['P', 'q']]
  
  // Number Data
  numberTriplets?: number[]; // e.g. [4, 2, 8]
  
  // Word Data
  wordOptions?: string[]; // e.g. ["Halt", "Cold", "Stop"]
  
  // Spatial Data
  spatialPairs?: boolean[]; // true = match (same), false = no match (mirror)
}

export interface UserResponse {
  questionId: string;
  category: AssessmentCategory;
  selectedAnswer: string;
  correctAnswer: string;
  timeTakenMs: number;
  isCorrect: boolean;
  questionContext: string; // Snapshot of the specific question content for analysis
}

export interface AssessmentRecord {
  id: string;
  date: string; // ISO string
  mode: 'Full' | 'Practice';
  score: number;
  totalQuestions: number;
  analysisSummary: string;
}

export interface AssessmentState {
  phase: AssessmentPhase;
  activeTestQueue: AssessmentCategory[]; // The list of tests to run (All 5 or just 1)
  currentCategoryIndex: number; // Pointer to current index in activeTestQueue
  currentQuestionIndex: number; 
  questions: Question[]; 
  responses: UserResponse[]; 
  isLoading: boolean;
  isGenerating: boolean;
  startTime: number | null;
  reasoningStep: 'statement' | 'question'; 
}

export interface AnalysisResult {
  iqEstimateRange: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  categoryScores: {
    category: string;
    score: number;
    description: string;
  }[];
  incorrectQuestions: {
    questionText: string;
    userAnswer: string;
    correctAnswer: string;
    explanation: string;
  }[];
}
