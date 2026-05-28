import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import {
  buildPrompt,
  extractJson,
  GeneratedPaper,
  GenerationInput,
  normalizePaper,
} from './paperGeneration';

export type {
  GenerationInput,
  GeneratedPaper,
  GeneratedQuestion,
  GeneratedSection,
} from './paperGeneration';

export { generateMockPaper, buildPrompt, extractJson, normalizePaper } from './paperGeneration';

let genAI: GoogleGenerativeAI | null = null;
let model: GenerativeModel | null = null;

function getModel(): GenerativeModel {
  if (model) return model;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  genAI = new GoogleGenerativeAI(apiKey);
  model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    generationConfig: {
      temperature: 0.55,
      responseMimeType: 'application/json',
    },
  });
  return model;
}

export async function generateWithGemini(input: GenerationInput): Promise<GeneratedPaper> {
  const geminiModel = getModel();
  const prompt = buildPrompt(input);
  const result = await geminiModel.generateContent(prompt);
  const response = result.response.text();
  const parsed = JSON.parse(extractJson(response)) as GeneratedPaper;
  return normalizePaper(parsed, input);
}
