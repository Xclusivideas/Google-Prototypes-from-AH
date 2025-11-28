
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AssessmentCategory, Question, AnalysisResult, UserResponse } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

const questionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          // category is implied by the request, but we ask for it to keep object consistent
          correctAnswer: { type: Type.STRING, description: "The correct answer value as a string." },
          
          // Reasoning
          reasoningStatement: { type: Type.STRING, description: "For Reasoning: The premise (e.g., 'Tom is heavier than Fred')." },
          reasoningQuestion: { type: Type.STRING, description: "For Reasoning: The question (e.g., 'Who is lighter?')." },
          reasoningOptions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "For Reasoning: Two names." },
          
          // Perceptual
          perceptualPairs: { 
            type: Type.ARRAY, 
            items: { type: Type.ARRAY, items: { type: Type.STRING } },
            description: "For Perceptual: 4 pairs of letters. e.g. [['E','e'], ['P','q']]" 
          },
          
          // Number
          numberTriplets: { 
            type: Type.ARRAY, 
            items: { type: Type.NUMBER },
            description: "For Number: 3 distinct numbers." 
          },
          
          // Word
          wordOptions: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "For Word: 3 words." 
          },
          
          // Spatial
          spatialPairs: { 
            type: Type.ARRAY, 
            items: { type: Type.BOOLEAN },
            description: "For Spatial: Array of exactly 2 booleans. true if pair matches (rotation), false if mirror." 
          }
        },
        required: ["correctAnswer"]
      }
    }
  },
  required: ["questions"]
};

const analysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    iqEstimateRange: { type: Type.STRING },
    summary: { type: Type.STRING },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
    recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
    categoryScores: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          score: { type: Type.NUMBER },
          description: { type: Type.STRING }
        },
        required: ["category", "score", "description"]
      }
    },
    incorrectQuestions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          questionText: { type: Type.STRING },
          userAnswer: { type: Type.STRING },
          correctAnswer: { type: Type.STRING },
          explanation: { type: Type.STRING }
        },
        required: ["questionText", "userAnswer", "correctAnswer", "explanation"]
      }
    }
  },
  required: ["iqEstimateRange", "summary", "strengths", "weaknesses", "recommendations", "categoryScores", "incorrectQuestions"]
};

// Utility to shuffle array
function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

// Now generates questions for a SINGLE category to handle volume
export const generateQuestions = async (category: AssessmentCategory, count: number): Promise<Question[]> => {
  if (!apiKey) throw new Error("API Key is missing.");

  const prompt = `
    Generate ${count} distinct GIA-style psychometric questions for the category: "${category}".
    
    STRICT RULES FOR "${category}":
    
    ${getCategoryRules(category)}

    Return a JSON object with a "questions" array containing exactly ${count} items.
    Ensure questions vary in difficulty slightly but mostly test processing speed (simple tasks).
    
    IMPORTANT: 
    1. All 'correctAnswer' fields must be strings.
    2. Ensure the specific fields for "${category}" are populated (e.g. wordOptions, numberTriplets, etc). Do not leave them empty.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: questionSchema,
        temperature: 0.7, 
      },
    });

    const data = JSON.parse(response.text || '{}');
    
    if (!data.questions || !Array.isArray(data.questions)) {
      throw new Error("Invalid response structure from Gemini");
    }

    // Assign IDs, categories and limits + Randomize
    return data.questions.map((q: any, index: number) => {
      
      // Randomize Word Meaning options so the answer isn't always in the same spot
      if (category === AssessmentCategory.WORD_MEANING && q.wordOptions && Array.isArray(q.wordOptions)) {
        q.wordOptions = shuffleArray(q.wordOptions);
      }

      // Randomize Number Speed triplets so they aren't always sorted
      if (category === AssessmentCategory.NUMBER_SPEED && q.numberTriplets && Array.isArray(q.numberTriplets)) {
        q.numberTriplets = shuffleArray(q.numberTriplets);
      }

      return {
        ...q,
        id: `q-${category.replace(/\s/g, '')}-${index}-${Date.now()}`,
        category: category,
        timeLimitSeconds: getTimeLimitForCategory(category),
      };
    });

  } catch (error) {
    console.error(`Error generating questions for ${category}:`, error);
    throw error;
  }
};

function getCategoryRules(category: AssessmentCategory): string {
  switch (category) {
    case AssessmentCategory.REASONING:
      return `
       - Use classic comparative pairs: Heavier/Lighter, Taller/Shorter, Stronger/Weaker, Brighter/Duller, Happier/Sadder.
       - Use simple names (e.g., Tom, Bill, Ann, Sue, Pete).
       - Provide 'reasoningStatement' (e.g., "John is heavier than Bill").
       - Provide 'reasoningQuestion' (e.g., "Who is lighter?").
       - Provide 'reasoningOptions': The two names involved.
       - 'correctAnswer' must be one of the options.
      `;
    case AssessmentCategory.PERCEPTUAL_SPEED:
      return `
       - Provide 'perceptualPairs': List of 4 letter pairs (e.g., [['E','e'], ['P','q']]).
       - Mix of uppercase and lowercase.
       - Match logic: Same letter (case-insensitive) = MATCH (e.g., 'A' and 'a'). Different letter = NO MATCH (e.g., 'A' and 'b').
       - 'correctAnswer': The COUNT of matching pairs as a string (e.g., "2", "3").
      `;
    case AssessmentCategory.NUMBER_SPEED:
      return `
       - Provide 'numberTriplets': 3 distinct integers between 2 and 30. Keep numbers small for speed.
       - Logic: Identify highest and lowest. Determine which of these two is numerically FURTHER from the remaining number.
       - CRITICAL: The distances must NOT be equal. One must be clearly further. (e.g. 2, 5, 12 -> High 12, Low 2, Rem 5. |12-5|=7, |5-2|=3. 12 is further).
       - 'correctAnswer': The number that is the answer (as a string).
      `;
    case AssessmentCategory.WORD_MEANING:
      return `
       - Provide 'wordOptions': 3 common words.
       - Two words are related (synonyms, antonyms, or same category). One is odd.
       - Examples: (Up, Down, Street), (Circle, Square, Apple), (Big, Huge, Small).
       - 'correctAnswer': The odd word.
      `;
    case AssessmentCategory.SPATIAL_VISUALIZATION:
      return `
       - Provide 'spatialPairs': Array of exactly 2 booleans.
       - true = SAME symbol (rotated). false = MIRROR symbol (rotated).
       - 'correctAnswer': The COUNT of true values (0, 1, or 2) as a string.
      `;
    default:
      return "";
  }
}

export const analyzeResults = async (responses: UserResponse[]): Promise<AnalysisResult> => {
  if (!apiKey) return getMockAnalysis();

  const categoriesTested = Array.from(new Set(responses.map(r => r.category)));
  
  // Filter only incorrect responses to save context window and focus analysis
  const incorrectResponses = responses.filter(r => !r.isCorrect);

  const prompt = `
    Analyze these GIA assessment results. 
    The user answered ${responses.length} questions across these categories: ${categoriesTested.join(', ')}.
    
    Overall Accuracy: ${Math.round((responses.filter(r => r.isCorrect).length / responses.length) * 100)}%

    Incorrect Answers Data:
    ${JSON.stringify(incorrectResponses.map(r => ({
      category: r.category,
      questionContext: r.questionContext,
      userAnswer: r.selectedAnswer,
      correctAnswer: r.correctAnswer
    })))}
    
    Provide:
    1. A percentile estimate (e.g., "75th-85th Percentile").
    2. Detailed summary.
    3. Specific strengths and weaknesses.
    4. Recommendations.
    5. Scores for each category tested.
    6. 'incorrectQuestions' array: For each error in the data above, create an entry.
       - IMPORTANT: Map the 'questionContext' provided in the data to 'questionText' so the user knows what the question was.
       - For Word Meaning, list the 3 words.
       - Provide a helpful explanation.
    
    Output JSON.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
      },
    });
    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Error analyzing results:", error);
    return getMockAnalysis();
  }
};

function getTimeLimitForCategory(category: AssessmentCategory): number {
  // STRICT 5-second limit per question for high intensity speed test
  return 5;
}

function getMockAnalysis(): AnalysisResult {
  return {
    iqEstimateRange: "N/A",
    summary: "Analysis failed due to missing API key or error.",
    strengths: ["N/A"],
    weaknesses: ["N/A"],
    recommendations: ["Ensure API Key is set"],
    categoryScores: [],
    incorrectQuestions: []
  };
}
