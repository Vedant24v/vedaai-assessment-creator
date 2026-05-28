import { generateWithGroq } from './groq';
import { generateWithGemini } from './gemini';
import { generateMockPaper, GenerationInput, GeneratedPaper } from './paperGeneration';

export type LlmProvider = 'groq' | 'gemini' | 'mock';

export type { GenerationInput, GeneratedPaper, GeneratedQuestion, GeneratedSection } from './paperGeneration';
export { generateMockPaper, isLikelyMockQuestion } from './paperGeneration';

function isPlaceholder(value: string | undefined, placeholder: string) {
  return !value || value === placeholder;
}

export function resolveProvider(): LlmProvider {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase();
  if (explicit === 'groq' || explicit === 'gemini' || explicit === 'mock') {
    return explicit;
  }

  if (!isPlaceholder(process.env.GROQ_API_KEY, 'your_groq_api_key_here')) {
    return 'groq';
  }

  if (!isPlaceholder(process.env.GEMINI_API_KEY, 'your_gemini_api_key_here')) {
    return 'gemini';
  }

  return 'mock';
}

export function hasLlmApiKey(): boolean {
  return resolveProvider() !== 'mock';
}

export async function generateQuestionPaper(input: GenerationInput): Promise<GeneratedPaper> {
  const provider = resolveProvider();

  if (provider === 'mock') {
    console.warn('No LLM API key configured — using mock generator');
    return generateMockPaper(input);
  }

  try {
    if (provider === 'groq') {
      return await generateWithGroq(input);
    }
    return await generateWithGemini(input);
  } catch (err) {
    console.error(`${provider} generation failed:`, err instanceof Error ? err.message : err);
    throw err instanceof Error ? err : new Error(String(err));
  }
}
