
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Brain, 
  Clock, 
  ArrowRight, 
  CheckCircle2,
  RefreshCcw,
  Play,
  HelpCircle,
  Eye,
  Calculator,
  Type,
  BoxSelect,
  History,
  LayoutGrid,
  ChevronLeft,
  XCircle,
  AlertCircle,
  Volume2,
  VolumeX,
  Home
} from 'lucide-react';
import { AssessmentCategory, AssessmentState, UserResponse, AnalysisResult, AssessmentRecord, Question } from './types';
import { generateQuestions, analyzeResults } from './services/geminiService';
import { RadialChart } from './components/RadialChart';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ProgressBar } from './components/ProgressBar';
import { SpatialView } from './components/SpatialView';

const FULL_ASSESSMENT_ORDER = [
  AssessmentCategory.REASONING,
  AssessmentCategory.PERCEPTUAL_SPEED,
  AssessmentCategory.NUMBER_SPEED,
  AssessmentCategory.WORD_MEANING,
  AssessmentCategory.SPATIAL_VISUALIZATION
];

// Increased to 40 per section as requested
const QUESTIONS_PER_CATEGORY = 40; 

export default function App() {
  const [assessmentState, setAssessmentState] = useState<AssessmentState>({
    phase: 'intro',
    activeTestQueue: [],
    currentCategoryIndex: 0,
    currentQuestionIndex: 0,
    questions: [],
    responses: [],
    isLoading: false,
    isGenerating: false,
    startTime: null,
    reasoningStep: 'statement'
  });

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<AssessmentRecord[]>([]);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isTimeoutFlash, setIsTimeoutFlash] = useState(false);
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  
  const timerRef = useRef<number | null>(null);

  // Load history on mount
  useEffect(() => {
    const saved = localStorage.getItem('gia_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history");
      }
    }
  }, []);

  // Fake loading progress simulation - Slower and smoother
  useEffect(() => {
    let interval: number;
    if (assessmentState.isLoading) {
      setLoadingProgress(0);
      interval = window.setInterval(() => {
        setLoadingProgress(prev => {
          // Asymptote to 98% until real data arrives
          if (prev >= 98) return 98;
          // Smaller random increment for smoother feel
          const inc = Math.random() < 0.3 ? 2 : 1; 
          return prev + inc;
        });
      }, 200); // 200ms tick for slower animation
    } else {
      setLoadingProgress(100);
    }
    return () => clearInterval(interval);
  }, [assessmentState.isLoading]);

  // --- Actions ---

  const startFullAssessment = useCallback(async () => {
    setAnalysis(null);
    setAssessmentState(prev => ({ 
      ...prev, 
      activeTestQueue: FULL_ASSESSMENT_ORDER,
      responses: [], 
      currentCategoryIndex: 0,
      phase: 'instructions', 
      isGenerating: false
    }));
    await loadSection(FULL_ASSESSMENT_ORDER[0]);
  }, []);

  const startPracticeTest = useCallback(async (category: AssessmentCategory) => {
    setAnalysis(null);
    setAssessmentState(prev => ({
      ...prev,
      activeTestQueue: [category], // Only one test in queue
      responses: [],
      currentCategoryIndex: 0,
      phase: 'instructions', 
      isGenerating: false
    }));
    await loadSection(category);
  }, []);

  const loadSection = async (category: AssessmentCategory) => {
    setAssessmentState(prev => ({
      ...prev,
      isLoading: true,
      questions: [] 
    }));

    try {
      const questions = await generateQuestions(category, QUESTIONS_PER_CATEGORY);
      
      setAssessmentState(prev => ({
        ...prev,
        questions,
        currentQuestionIndex: 0,
        isLoading: false
      }));
    } catch (error) {
      console.error(error);
      alert("Failed to load section. Please check your connection.");
      setAssessmentState(prev => ({ ...prev, isLoading: false, phase: 'intro' }));
    }
  };

  const restartCurrentSection = async () => {
    if (window.confirm("Restart this section? Current progress for this test will be lost.")) {
      const category = assessmentState.activeTestQueue[assessmentState.currentCategoryIndex];
      
      // CRITICAL FIX: Switch to instructions phase IMMEDIATELY before awaiting data load.
      // This ensures the "Generating..." screen appears and the UI doesn't blank out.
      setAssessmentState(prev => ({
        ...prev,
        phase: 'instructions',
        isLoading: true,
        responses: prev.responses.filter(r => r.category !== category) 
      }));

      await loadSection(category);
    }
  };

  const playBuzzer = () => {
    if (!isAudioEnabled) return;

    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);
      
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      console.error("Audio play failed", e);
    }
  };

  const handleTimeOut = useCallback(() => {
    if (hasTimedOut) return;
    setHasTimedOut(true);
    playBuzzer();
    setIsTimeoutFlash(true);
    setTimeout(() => {
      setIsTimeoutFlash(false);
      // NOTE: We do NOT auto-submit answer here anymore. 
      // User must still answer to proceed, but they've been alerted.
    }, 600);
  }, [assessmentState, isAudioEnabled, hasTimedOut]);

  // Timer Logic
  useEffect(() => {
    const isTestPhase = assessmentState.phase === 'test';
    const currentCategory = assessmentState.activeTestQueue[assessmentState.currentCategoryIndex];
    const isReasoningStatement = currentCategory === AssessmentCategory.REASONING && assessmentState.reasoningStep === 'statement';
    
    // Stop timer if we've already timed out (waiting for user answer now)
    const shouldRunTimer = isTestPhase && !isReasoningStatement && !isTimeoutFlash && !assessmentState.isLoading && !hasTimedOut;

    if (shouldRunTimer && timeLeft > 0) {
      timerRef.current = window.setTimeout(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && shouldRunTimer) {
      handleTimeOut();
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timeLeft, assessmentState.phase, assessmentState.reasoningStep, assessmentState.currentCategoryIndex, isTimeoutFlash, handleTimeOut, assessmentState.isLoading, hasTimedOut]);

  const handleInstructionsDismiss = () => {
    if (assessmentState.isLoading || assessmentState.questions.length === 0) return;
    const currentQuestion = assessmentState.questions[0];
    setTimeLeft(currentQuestion.timeLimitSeconds);
    setHasTimedOut(false);
    setAssessmentState(prev => ({ 
      ...prev, 
      phase: 'test',
      currentQuestionIndex: 0,
      startTime: Date.now(),
      reasoningStep: 'statement' 
    }));
  };

  const quitAssessment = () => {
    if (window.confirm("Are you sure you want to quit this assessment? Your progress will be lost.")) {
      setAssessmentState(prev => ({ ...prev, phase: 'intro', activeTestQueue: [], questions: [], responses: [] }));
    }
  };

  const getQuestionContext = (q: Question): string => {
    try {
      switch (q.category) {
        case AssessmentCategory.REASONING:
          return `Statement: "${q.reasoningStatement || ''}". Question: "${q.reasoningQuestion || ''}"`;
        case AssessmentCategory.PERCEPTUAL_SPEED:
          return `Pairs: ${JSON.stringify(q.perceptualPairs || [])}`;
        case AssessmentCategory.NUMBER_SPEED:
          return `Numbers: ${q.numberTriplets?.join(', ') || ''}`;
        case AssessmentCategory.WORD_MEANING:
          // Ensure we don't return "Words: undefined" if options are missing
          return q.wordOptions && q.wordOptions.length > 0 
            ? `Words: ${q.wordOptions.join(', ')}` 
            : `Word Meaning Question (Data missing)`;
        case AssessmentCategory.SPATIAL_VISUALIZATION:
          return `Spatial Pairs: ${JSON.stringify(q.spatialPairs || [])}`;
        default:
          return "Unknown Context";
      }
    } catch (e) {
      return "Error retrieving context";
    }
  };

  const handleAnswer = (selectedAnswer: string, isTimeout = false) => {
    if (assessmentState.phase !== 'test') return;
    if (isTimeoutFlash && !isTimeout) return;

    const currentQuestion = assessmentState.questions[assessmentState.currentQuestionIndex];
    if (!currentQuestion) return;
    
    const isCorrect = String(selectedAnswer).toLowerCase() === String(currentQuestion.correctAnswer).toLowerCase();
    const timeTaken = Date.now() - (assessmentState.startTime || Date.now());
    
    const newResponse: UserResponse = {
      questionId: currentQuestion.id,
      category: currentQuestion.category,
      selectedAnswer: String(selectedAnswer),
      correctAnswer: String(currentQuestion.correctAnswer),
      timeTakenMs: timeTaken,
      isCorrect,
      questionContext: getQuestionContext(currentQuestion)
    };

    const updatedResponses = [...assessmentState.responses, newResponse];
    setAssessmentState(prev => ({ ...prev, responses: updatedResponses }));
    nextQuestion(updatedResponses);
  };

  const nextQuestion = async (currentResponses: UserResponse[]) => {
    const nextIndex = assessmentState.currentQuestionIndex + 1;

    // More questions in current section?
    if (nextIndex < assessmentState.questions.length) {
      const nextQuestion = assessmentState.questions[nextIndex];
      setAssessmentState(prev => ({
        ...prev,
        currentQuestionIndex: nextIndex,
        startTime: Date.now(),
        reasoningStep: 'statement'
      }));
      setTimeLeft(nextQuestion.timeLimitSeconds);
      setHasTimedOut(false);
      
    } else {
      // End of Section
      const nextCatIndex = assessmentState.currentCategoryIndex + 1;
      
      // More sections in queue?
      if (nextCatIndex < assessmentState.activeTestQueue.length) {
        setAssessmentState(prev => ({
          ...prev,
          phase: 'instructions',
          currentCategoryIndex: nextCatIndex,
          questions: [] 
        }));
        await loadSection(assessmentState.activeTestQueue[nextCatIndex]);
      } else {
        // End of Assessment
        finishAssessment(currentResponses);
      }
    }
  };

  const finishAssessment = async (finalResponses: UserResponse[]) => {
    setAssessmentState(prev => ({ ...prev, phase: 'analysis', isLoading: true }));
    const result = await analyzeResults(finalResponses);
    setAnalysis(result);

    // Save history
    const isFull = assessmentState.activeTestQueue.length > 1;
    const correctCount = finalResponses.filter(r => r.isCorrect).length;
    const record: AssessmentRecord = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      mode: isFull ? 'Full' : 'Practice',
      totalQuestions: finalResponses.length,
      score: Math.round((correctCount / finalResponses.length) * 100),
      analysisSummary: result.summary.substring(0, 100) + "..."
    };
    
    const updatedHistory = [record, ...history];
    setHistory(updatedHistory);
    localStorage.setItem('gia_history', JSON.stringify(updatedHistory));

    setAssessmentState(prev => ({ ...prev, isLoading: false }));
  };

  // --- Helpers ---
  
  const currentCategoryName = assessmentState.activeTestQueue[assessmentState.currentCategoryIndex] || "";

  // --- Renderers ---

  const renderHistory = () => (
    <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center">
      <div className="max-w-4xl w-full">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => setAssessmentState(prev => ({...prev, phase: 'intro'}))} className="p-2 bg-white rounded-full hover:bg-slate-100 border border-slate-200">
            <ChevronLeft />
          </button>
          <h2 className="text-3xl font-bold text-slate-900">Assessment History</h2>
        </div>

        {history.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-slate-200">
            <History className="w-16 h-16 mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500 text-lg">No history recorded yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {history.map((rec) => (
              <div key={rec.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-6">
                 <div className="flex items-center gap-4">
                   <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white ${rec.score >= 70 ? 'bg-green-500' : 'bg-slate-500'}`}>
                     {rec.score}%
                   </div>
                   <div>
                     <div className="font-bold text-slate-900 text-lg">{rec.mode} Assessment</div>
                     <div className="text-slate-500 text-sm">{new Date(rec.date).toLocaleDateString()} • {rec.totalQuestions} Questions</div>
                   </div>
                 </div>
                 <div className="text-slate-600 text-sm md:text-right max-w-md">
                   {rec.analysisSummary}
                 </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderIntro = () => {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 md:p-8 font-sans">
        <header className="max-w-6xl w-full flex justify-between items-center mb-12">
           <div className="flex items-center gap-3">
             <div className="bg-slate-900 p-2 rounded-lg">
               <Brain className="text-white w-6 h-6" />
             </div>
             <span className="text-xl font-bold text-slate-900 tracking-tight">CogniGen GIA</span>
           </div>
           <button onClick={() => setAssessmentState(prev => ({...prev, phase: 'history'}))} className="flex items-center gap-2 text-slate-600 hover:text-primary-600 font-medium transition-colors">
             <History className="w-5 h-5" /> History
           </button>
        </header>

        <main className="max-w-5xl w-full space-y-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
          
          {/* Hero Section */}
          <section className="text-center space-y-8">
            <h1 className="text-5xl md:text-7xl font-extrabold text-slate-900 tracking-tight leading-tight">
              General Intelligence <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-purple-600">Assessment</span>
            </h1>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Measure your mental speed and accuracy across 5 key cognitive domains. 
              Used for recruitment and development.
            </p>
            
            <button 
              onClick={startFullAssessment}
              className="group relative inline-flex items-center gap-3 px-8 py-4 bg-slate-900 text-white rounded-2xl font-bold text-xl shadow-xl hover:shadow-2xl hover:bg-slate-800 transition-all hover:-translate-y-1 overflow-hidden"
            >
              <span className="relative z-10">Start Full Assessment</span>
              <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform relative z-10" />
              <div className="absolute inset-0 bg-gradient-to-r from-primary-600 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>
            <div className="text-sm text-slate-400 font-medium">Est. 15-20 Minutes • {QUESTIONS_PER_CATEGORY * 5} Questions</div>
          </section>

          {/* Practice Grid */}
          <section>
             <div className="flex items-center gap-3 mb-8">
               <LayoutGrid className="text-slate-400" />
               <h3 className="text-xl font-bold text-slate-900">Practice Individual Modules</h3>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                  { id: AssessmentCategory.REASONING, icon: Brain, color: "text-blue-500", label: "Reasoning" },
                  { id: AssessmentCategory.PERCEPTUAL_SPEED, icon: Eye, color: "text-purple-500", label: "Perceptual" },
                  { id: AssessmentCategory.NUMBER_SPEED, icon: Calculator, color: "text-green-500", label: "Number Speed" },
                  { id: AssessmentCategory.WORD_MEANING, icon: Type, color: "text-orange-500", label: "Word Meaning" },
                  { id: AssessmentCategory.SPATIAL_VISUALIZATION, icon: BoxSelect, color: "text-indigo-500", label: "Spatial" },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => startPracticeTest(item.id)}
                    className="flex flex-col items-center justify-center p-6 bg-white border border-slate-200 rounded-2xl hover:border-primary-400 hover:shadow-lg transition-all group"
                  >
                    <item.icon className={`w-10 h-10 mb-4 ${item.color} group-hover:scale-110 transition-transform`} />
                    <span className="font-bold text-slate-700 text-sm text-center">{item.label}</span>
                  </button>
                ))}
             </div>
          </section>
        </main>
      </div>
    );
  };

  const renderInstructions = () => {
    // Current category is determined by the queue and index
    const category = assessmentState.activeTestQueue[assessmentState.currentCategoryIndex];
    
    let title = "";
    let description = "";
    let tips = "";
    let icon = <HelpCircle />;
    let colorClass = "text-slate-600";

    switch (category) {
      case AssessmentCategory.REASONING:
        title = "Reasoning";
        description = "This test measures your ability to make inferences from information presented.";
        tips = "You will see a statement (e.g., 'A is heavier than B'). Read it, then click to see the question (e.g., 'Who is lighter?'). Answer quickly.";
        icon = <Brain className="w-12 h-12 text-blue-500" />;
        colorClass = "text-blue-600";
        break;
      case AssessmentCategory.PERCEPTUAL_SPEED:
        title = "Perceptual Speed";
        description = "This test measures the speed and accuracy of your visual perception.";
        tips = "You will see 4 pairs of letters. Count how many pairs contain the SAME letter (e.g. 'E' and 'e' match). Ignore case.";
        icon = <Eye className="w-12 h-12 text-purple-500" />;
        colorClass = "text-purple-600";
        break;
      case AssessmentCategory.NUMBER_SPEED:
        title = "Number Speed";
        description = "This test measures your speed and accuracy in manipulating numbers mentally.";
        tips = "1. Find the highest and lowest numbers. 2. Determine which of these two is numerically FURTHER from the remaining number.";
        icon = <Calculator className="w-12 h-12 text-green-500" />;
        colorClass = "text-green-600";
        break;
      case AssessmentCategory.WORD_MEANING:
        title = "Word Meaning";
        description = "This test measures your understanding of word meanings and vocabulary.";
        tips = "You will see three words. Two are related (synonyms, antonyms, or same category). Select the ODD one out.";
        icon = <Type className="w-12 h-12 text-orange-500" />;
        colorClass = "text-orange-600";
        break;
      case AssessmentCategory.SPATIAL_VISUALIZATION:
        title = "Spatial Visualization";
        description = "This test measures your ability to mentally rotate and manipulate shapes.";
        tips = "You will see two pairs of symbols. For each pair, decide if the bottom symbol is the SAME as the top (rotated) or a MIRROR image. Count the matching pairs.";
        icon = <BoxSelect className="w-12 h-12 text-indigo-500" />;
        colorClass = "text-indigo-600";
        break;
      default:
        title = "Instructions";
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 animate-in fade-in zoom-in-95 duration-300 relative">
        {/* Navigation Controls */}
        <div className="absolute top-6 right-6 flex items-center gap-3">
           <button 
             type="button"
             onClick={quitAssessment} 
             className="flex items-center gap-2 px-4 py-2 bg-white rounded-full text-slate-500 hover:text-red-500 hover:bg-red-50 transition-colors shadow-sm font-medium text-sm"
           >
             <Home className="w-4 h-4" /> Exit
           </button>
        </div>

        <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl overflow-hidden">
          <div className="bg-slate-50 p-10 text-center border-b border-slate-100">
            <div className="bg-white w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-slate-100">
              {icon}
            </div>
            <div className="uppercase tracking-widest text-xs font-bold text-slate-400 mb-2">
              Test {assessmentState.currentCategoryIndex + 1} of {assessmentState.activeTestQueue.length}
            </div>
            <h2 className={`text-4xl font-bold mb-4 ${colorClass}`}>{title}</h2>
            <p className="text-lg text-slate-600 leading-relaxed max-w-lg mx-auto">{description}</p>
          </div>
          
          <div className="p-10 bg-white">
             <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-r-xl mb-10">
                <h4 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" /> Task Requirement:
                </h4>
                <p className="text-blue-800">{tips}</p>
                <div className="mt-4 flex gap-2">
                   <div className="text-sm font-bold text-blue-600 bg-white inline-block px-3 py-1 rounded-full border border-blue-100">
                     {QUESTIONS_PER_CATEGORY} Questions
                   </div>
                   <div className="text-sm font-bold text-blue-600 bg-white inline-block px-3 py-1 rounded-full border border-blue-100">
                     5s Time Limit
                   </div>
                </div>
             </div>
             
             <button 
              type="button"
              onClick={handleInstructionsDismiss}
              disabled={assessmentState.isLoading}
              className="w-full h-24 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-900 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 text-xl shadow-lg hover:shadow-xl hover:-translate-y-1 overflow-hidden relative"
            >
              {assessmentState.isLoading ? (
                 <div className="w-full px-8 relative z-10 flex flex-col items-center justify-center h-full">
                    <div className="flex flex-col items-center gap-2 mb-2 w-full text-slate-200">
                        <div className="flex items-center gap-3">
                          <span className="text-xl font-bold tracking-wide animate-pulse">Generating Test Items...</span>
                        </div>
                    </div>
                    <div className="w-full max-w-sm bg-slate-800/50 rounded-full h-3 overflow-hidden backdrop-blur-sm border border-slate-700">
                        <div 
                            className="bg-primary-500 h-full rounded-full transition-all duration-300 ease-out shadow-[0_0_15px_rgba(14,165,233,0.6)] relative overflow-hidden" 
                            style={{ width: `${loadingProgress}%` }}
                        >
                            <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                        </div>
                    </div>
                     <span className="font-mono text-primary-400 font-bold text-sm mt-1">{loadingProgress}%</span>
                 </div>
              ) : (
                 <>Start Section <ArrowRight className="w-6 h-6" /></>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderReasoning = (question: any) => {
    if (assessmentState.reasoningStep === 'statement') {
      return (
        <div 
          className="text-center py-20 cursor-pointer select-none" 
          onClick={() => setAssessmentState(prev => ({ ...prev, reasoningStep: 'question' }))}
        >
          <div className="inline-block bg-blue-50 border-2 border-blue-100 rounded-2xl px-12 py-12 shadow-sm hover:bg-blue-100 transition-colors max-w-2xl">
            <h3 className="text-2xl md:text-4xl font-bold text-slate-800 leading-tight">{question.reasoningStatement}</h3>
          </div>
          <div className="mt-12 flex flex-col items-center gap-3 animate-pulse">
             <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center text-primary-600">
                <Play className="w-6 h-6 fill-current" />
             </div>
             <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">Click to reveal question</p>
          </div>
        </div>
      );
    }
    return (
      <div className="text-center animate-in fade-in slide-in-from-bottom-8 duration-300">
        <h3 className="text-3xl font-bold text-slate-800 mb-12">{question.reasoningQuestion}</h3>
        <div className="grid grid-cols-2 gap-6 max-w-lg mx-auto">
          {question.reasoningOptions?.map((opt: string) => (
             <button
                key={opt}
                type="button"
                onClick={() => handleAnswer(opt)}
                className="p-8 bg-white border-2 border-slate-200 rounded-2xl hover:border-primary-500 hover:bg-primary-50 hover:shadow-lg text-2xl font-bold text-slate-800 transition-all active:scale-95"
             >
               {opt}
             </button>
          ))}
        </div>
      </div>
    );
  };

  const renderPerceptual = (question: any) => {
    return (
      <div className="text-center">
         <p className="text-slate-500 mb-8 font-medium text-lg">How many pairs match (same letter)?</p>
         
         <div className="flex justify-center gap-4 mb-14 flex-wrap">
            {question.perceptualPairs?.map((pair: string[], i: number) => (
              <div key={i} className="flex flex-col border-2 border-slate-300 rounded-xl overflow-hidden w-24 md:w-28 shadow-sm">
                <div className="bg-slate-50 py-4 md:py-6 text-3xl md:text-4xl font-bold text-slate-800 border-b-2 border-slate-300">{pair[0]}</div>
                <div className="bg-white py-4 md:py-6 text-3xl md:text-4xl font-bold text-slate-800">{pair[1]}</div>
              </div>
            ))}
         </div>

         <div className="flex justify-center gap-4">
           {[0, 1, 2, 3, 4].map(num => (
             <button
               key={num}
               type="button"
               onClick={() => handleAnswer(String(num))}
               className="w-14 h-14 md:w-16 md:h-16 rounded-full border-2 border-slate-200 bg-white hover:bg-primary-600 hover:text-white hover:border-primary-600 font-bold text-2xl transition-all shadow-md active:scale-90"
             >
               {num}
             </button>
           ))}
         </div>
      </div>
    );
  };

  const renderNumberSpeed = (question: any) => {
    return (
      <div className="text-center">
        <p className="text-slate-500 mb-10 max-w-xl mx-auto font-medium text-lg leading-relaxed">
          Which number (Highest or Lowest) is <span className="text-slate-900 font-extrabold underline decoration-primary-500 decoration-4">FURTHER</span> from the remaining number?
        </p>

        <div className="flex justify-center gap-6 mb-14">
          {question.numberTriplets?.map((num: number) => (
             <div key={num} className="text-5xl md:text-6xl font-black text-slate-800 bg-white px-8 md:px-10 py-8 md:py-10 rounded-3xl border-2 border-slate-200 shadow-sm min-w-[120px]">
               {num}
             </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-6 max-w-xl mx-auto">
           {question.numberTriplets?.map((num: number) => (
             <button 
               key={`btn-${num}`}
               type="button"
               onClick={() => handleAnswer(String(num))}
               className="py-6 bg-slate-900 hover:bg-primary-600 text-white font-bold text-2xl rounded-2xl transition-all shadow-lg active:scale-95"
             >
               {num}
             </button>
           ))}
        </div>
      </div>
    );
  };

  const renderWordMeaning = (question: any) => {
    return (
      <div className="text-center">
        <p className="text-slate-500 mb-12 font-medium text-lg">Select the <span className="font-bold text-slate-900 bg-yellow-100 px-2 rounded">ODD</span> word out.</p>
        <div className="flex flex-col md:flex-row gap-6 justify-center max-w-5xl mx-auto">
          {question.wordOptions?.map((word: string) => (
            <button
              key={word}
              type="button"
              onClick={() => handleAnswer(word)}
              className="px-8 py-10 bg-white border-2 border-slate-200 rounded-2xl hover:border-primary-500 hover:bg-primary-50 text-xl md:text-2xl font-bold text-slate-700 transition-all min-w-[200px] shadow-sm active:scale-95"
            >
              {word}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderSpatial = (question: any) => {
    return (
      <div className="text-center">
        <p className="text-slate-500 mb-8 font-medium text-lg">How many pairs contain the <strong>SAME</strong> symbol (rotated)?</p>
        <SpatialView key={question.id} pairs={question.spatialPairs || []} />
        
        <div className="flex justify-center gap-6 mt-12">
           {[0, 1, 2].map(num => (
             <button
               key={num}
               type="button"
               onClick={() => handleAnswer(String(num))}
               className="w-20 h-20 rounded-full border-2 border-slate-200 bg-white hover:bg-primary-600 hover:text-white hover:border-primary-600 font-bold text-3xl transition-all shadow-md active:scale-90"
             >
               {num}
             </button>
           ))}
        </div>
      </div>
    );
  };

  const renderTestPhase = () => {
    const question = assessmentState.questions[assessmentState.currentQuestionIndex];
    
    // Fallback content to prevent crash/empty screen if data is being swapped
    const content = question ? (() => {
      switch(question.category) {
        case AssessmentCategory.REASONING: return renderReasoning(question);
        case AssessmentCategory.PERCEPTUAL_SPEED: return renderPerceptual(question);
        case AssessmentCategory.NUMBER_SPEED: return renderNumberSpeed(question);
        case AssessmentCategory.WORD_MEANING: return renderWordMeaning(question);
        case AssessmentCategory.SPATIAL_VISUALIZATION: return renderSpatial(question);
        default: return <div>Unknown category</div>;
      }
    })() : <LoadingSpinner message="Loading Question..." />;

    return (
      <div className={`min-h-screen py-6 px-4 flex flex-col items-center transition-colors duration-100 ${isTimeoutFlash ? 'bg-red-500' : 'bg-slate-50'}`}>
        {/* Top Navigation Bar - Increased Z-Index to ensure clickability */}
        <nav className={`fixed top-0 w-full backdrop-blur-md border-b z-[100] h-16 flex items-center px-4 lg:px-8 justify-between shadow-sm transition-colors duration-100 ${isTimeoutFlash ? 'bg-red-600 border-red-700' : 'bg-white/90 border-slate-200'}`}>
           
           <div className="flex items-center gap-2 md:gap-4">
              <button 
                type="button"
                onClick={quitAssessment}
                className={`p-2 rounded-full transition-colors ${isTimeoutFlash ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-red-600'}`}
                title="Exit to Menu"
              >
                <Home className="w-5 h-5" />
              </button>

              <button 
                type="button"
                onClick={restartCurrentSection}
                className={`p-2 rounded-full transition-colors ${isTimeoutFlash ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-blue-600'}`}
                title="Restart Section"
              >
                <RefreshCcw className="w-5 h-5" />
              </button>

              <div className={`font-bold flex items-center gap-3 text-lg transition-colors ml-2 ${isTimeoutFlash ? 'text-white' : 'text-slate-900'}`}>
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono text-sm ${isTimeoutFlash ? 'bg-white text-red-600' : 'bg-slate-900 text-white'}`}>
                  {assessmentState.currentCategoryIndex + 1}
                </span>
                <span className="hidden md:inline text-sm md:text-base">{currentCategoryName}</span>
              </div>
           </div>
           
           <div className="flex items-center gap-4 md:gap-6">
             {/* Audio Toggle */}
             <button 
                type="button"
                onClick={() => setIsAudioEnabled(!isAudioEnabled)}
                className={`p-2 rounded-full transition-colors ${isTimeoutFlash ? 'bg-red-500 text-white' : (isAudioEnabled ? 'bg-slate-100 text-primary-600' : 'bg-slate-100 text-slate-400')}`}
                title={isAudioEnabled ? "Mute Sound" : "Enable Sound"}
             >
               {isAudioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
             </button>

             <div className={`text-sm font-medium hidden sm:block transition-colors ${isTimeoutFlash ? 'text-white/80' : 'text-slate-500'}`}>
                Q <span className={`font-bold ${isTimeoutFlash ? 'text-white' : 'text-slate-900'}`}>{assessmentState.currentQuestionIndex + 1}</span> / {QUESTIONS_PER_CATEGORY}
             </div>
             
             <div className={`flex items-center gap-2 font-mono text-xl font-bold transition-colors ${isTimeoutFlash ? 'text-white' : (timeLeft < 3 ? 'text-red-500 animate-pulse' : 'text-slate-700')}`}>
               <Clock className="w-5 h-5" />
               {timeLeft}s
             </div>
           </div>
        </nav>

        <div className="mt-20 max-w-5xl mx-auto w-full animate-fade-in relative">
          
          {/* Timeout Overlay */}
          {isTimeoutFlash && (
            <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
              <div className="text-white text-6xl font-black animate-ping uppercase">Time's Up!</div>
            </div>
          )}

          <div className={`bg-white rounded-3xl shadow-xl border overflow-hidden min-h-[600px] flex flex-col relative transition-colors ${isTimeoutFlash ? 'border-red-400' : 'border-slate-100'}`}>
            
            <div className="px-10 pt-8 pb-2">
               {question && (
                <ProgressBar 
                    current={assessmentState.currentQuestionIndex + 1} 
                    total={QUESTIONS_PER_CATEGORY}
                    timeLeft={timeLeft}
                    totalTime={question.timeLimitSeconds}
                />
               )}
            </div>

            <div className={`flex-grow flex items-center justify-center p-8 md:p-12 transition-opacity duration-200 ${isTimeoutFlash ? 'opacity-20 blur-sm' : 'opacity-100'}`}>
              <div className="w-full pointer-events-auto">
                 {content}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // --- Main Render Switch ---

  if (assessmentState.phase === 'intro') {
    return renderIntro();
  }

  if (assessmentState.phase === 'history') {
    return renderHistory();
  }

  if (assessmentState.phase === 'instructions') {
    return renderInstructions();
  }

  if (assessmentState.phase === 'test') {
    return renderTestPhase();
  }

  if (assessmentState.phase === 'analysis' && analysis) {
    // Results View
    const correctCount = assessmentState.responses.filter(r => r.isCorrect).length;
    const accuracy = Math.round((correctCount / assessmentState.responses.length) * 100);

    return (
      <div className="min-h-screen bg-slate-50 py-12 px-4">
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-3xl shadow-xl p-10 border border-slate-100">
               <div className="flex items-center justify-between mb-8">
                 <h2 className="text-3xl font-bold text-slate-900">Assessment Profile</h2>
                 <span className="px-4 py-1.5 bg-green-100 text-green-700 rounded-full text-sm font-bold uppercase tracking-wide border border-green-200">Completed</span>
               </div>
               
               <div className="flex flex-col md:flex-row gap-12 mb-10 border-b border-slate-100 pb-10">
                 <div>
                    <div className="text-sm uppercase text-slate-500 font-bold mb-2">Overall Accuracy</div>
                    <div className="text-6xl font-black text-primary-600 tracking-tight">{accuracy}%</div>
                 </div>
                 <div>
                    <div className="text-sm uppercase text-slate-500 font-bold mb-2">Est. GIA Percentile</div>
                    <div className="text-6xl font-black text-slate-800 tracking-tight">{analysis.iqEstimateRange}</div>
                 </div>
               </div>
               
               <div className="space-y-8">
                 <div>
                   <h3 className="font-bold text-slate-900 mb-3 text-lg">Performance Summary</h3>
                   <p className="text-slate-600 leading-relaxed bg-slate-50 p-6 rounded-2xl border border-slate-100">{analysis.summary}</p>
                 </div>
                 
                 <div className="grid md:grid-cols-2 gap-8">
                    <div>
                      <h3 className="font-bold text-green-700 mb-4 flex items-center gap-2 text-lg"><CheckCircle2 className="w-6 h-6"/> Key Strengths</h3>
                      <ul className="space-y-3">
                        {analysis.strengths.map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-slate-700">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 shrink-0"></div>
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h3 className="font-bold text-orange-600 mb-4 flex items-center gap-2 text-lg"><ArrowRight className="w-6 h-6"/> Recommendations</h3>
                      <ul className="space-y-3">
                        {analysis.recommendations.map((r, i) => (
                           <li key={i} className="flex items-start gap-2 text-slate-700">
                             <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-2 shrink-0"></div>
                             {r}
                           </li>
                        ))}
                      </ul>
                    </div>
                 </div>
               </div>
            </div>
            
            <div className="bg-white rounded-3xl shadow-xl p-8 flex flex-col border border-slate-100">
               <h3 className="text-xl font-bold text-slate-900 mb-6 text-center">Category Breakdown</h3>
               <div className="flex-grow flex items-center justify-center -ml-4">
                 <RadialChart data={analysis.categoryScores} />
               </div>
               <div className="mt-8 space-y-4">
                 {analysis.categoryScores.map((c, i) => (
                   <div key={i} className="flex justify-between items-center text-sm p-3 rounded-lg hover:bg-slate-50 transition-colors">
                     <span className="font-medium text-slate-600">{c.category}</span>
                     <span className="font-bold text-slate-900 bg-slate-100 px-3 py-1 rounded-full">{c.score}</span>
                   </div>
                 ))}
               </div>
            </div>
          </div>

          {/* Incorrect Answer Analysis Section */}
          {analysis.incorrectQuestions && analysis.incorrectQuestions.length > 0 && (
            <div className="bg-white rounded-3xl shadow-xl p-10 border border-slate-100">
              <h3 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-3">
                <AlertCircle className="w-8 h-8 text-red-500" />
                Incorrect Answer Analysis
              </h3>
              <p className="text-slate-500 mb-8">Reviewing your mistakes is the fastest way to improve. Here are the questions you missed:</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {analysis.incorrectQuestions.map((item, index) => (
                  <div key={index} className="bg-red-50 rounded-xl p-6 border border-red-100">
                    <div className="mb-4">
                       <span className="text-xs font-bold uppercase tracking-wide text-red-400">Question Content</span>
                       <div className="font-medium text-slate-800 mt-1">{item.questionText || "Question text unavailable"}</div>
                    </div>
                    <div className="flex gap-6 mb-4">
                       <div>
                          <span className="text-xs font-bold uppercase tracking-wide text-red-400">You Said</span>
                          <div className="font-bold text-red-700 flex items-center gap-1"><XCircle className="w-4 h-4"/> {item.userAnswer}</div>
                       </div>
                       <div>
                          <span className="text-xs font-bold uppercase tracking-wide text-green-600">Correct</span>
                          <div className="font-bold text-green-700 flex items-center gap-1"><CheckCircle2 className="w-4 h-4"/> {item.correctAnswer}</div>
                       </div>
                    </div>
                    <div className="text-sm text-slate-600 bg-white p-3 rounded-lg border border-red-100 italic">
                       "{item.explanation}"
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="flex justify-center pb-12 gap-4">
            <button onClick={() => setAssessmentState(prev => ({...prev, phase: 'intro'}))} className="px-10 py-4 bg-white border-2 border-slate-200 rounded-2xl hover:border-slate-500 hover:text-slate-800 font-bold text-slate-600 flex gap-3 transition-all shadow-sm text-lg items-center">
              <ChevronLeft className="w-6 h-6" /> Back to Menu
            </button>
            <button onClick={startFullAssessment} className="px-10 py-4 bg-primary-600 border-2 border-primary-600 rounded-2xl hover:bg-primary-700 font-bold text-white flex gap-3 transition-all shadow-sm text-lg items-center">
              <RefreshCcw className="w-6 h-6" /> Retake Full Test
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fallback / Loading
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <LoadingSpinner message="Loading application..." />
    </div>
  );
}
