import {
  buildPrompt,
  extractJson,
  GeneratedPaper,
  GenerationInput,
  normalizePaper,
} from './paperGeneration';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function generateWithGroq(input: GenerationInput): Promise<GeneratedPaper> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === 'your_groq_api_key_here') {
    throw new Error('GROQ_API_KEY is not configured');
  }

  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const prompt = buildPrompt(input);

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert assessment designer. Respond with a single valid JSON object only. No markdown fences or extra text.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.55,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Groq returned empty response');
  }

  const parsed = JSON.parse(extractJson(content)) as GeneratedPaper;
  return normalizePaper(parsed, input);
}
