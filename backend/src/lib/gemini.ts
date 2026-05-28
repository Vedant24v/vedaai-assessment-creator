import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

interface QuestionType {
  type: string;
  count: number;
  marks: number;
}

export interface GenerationInput {
  subject: string;
  className: string;
  totalMarks: number;
  duration: number;
  questionTypes: QuestionType[];
  additionalInstructions?: string;
  contentText?: string;
}

export interface GeneratedQuestion {
  id: string;
  text: string;
  difficulty: 'easy' | 'medium' | 'hard';
  marks: number;
  type: string;
}

export interface GeneratedSection {
  id: string;
  title: string;
  instruction: string;
  questions: GeneratedQuestion[];
}

export interface GeneratedPaper {
  schoolName: string;
  subject: string;
  className: string;
  totalMarks: number;
  duration: number;
  sections: GeneratedSection[];
  answerKey?: { questionId: string; answer: string }[];
}

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

function calculatedTotal(input: GenerationInput) {
  return input.totalMarks || input.questionTypes.reduce((sum, qt) => sum + qt.count * qt.marks, 0);
}

function buildPrompt(input: GenerationInput): string {
  const questionTypesSummary = input.questionTypes
    .map((qt, index) => `${index + 1}. ${qt.type}: exactly ${qt.count} question(s), ${qt.marks} mark(s) each`)
    .join('\n');

  const totalQuestions = input.questionTypes.reduce((sum, qt) => sum + qt.count, 0);

  return `You are an expert K-12 assessment designer. Generate a polished school question paper as strict JSON.

Assignment:
- Subject: ${input.subject}
- Class: ${input.className}
- Total marks: ${calculatedTotal(input)}
- Duration: ${input.duration || 45} minutes
- Total questions: ${totalQuestions}

Required section plan:
${questionTypesSummary}

Difficulty distribution:
- About 40% easy
- About 40% medium
- About 20% hard

${input.additionalInstructions ? `Teacher instructions:\n${input.additionalInstructions}\n` : ''}
${input.contentText ? `Reference material. Use this only as context, do not copy long passages:\n${input.contentText.slice(0, 3000)}\n` : ''}

Rules:
1. Return JSON only. No markdown and no prose outside the JSON object.
2. Create one section per requested question type, in the same order.
3. Each section must contain exactly the requested count.
4. Each question must include id, text, difficulty, marks, and type.
5. difficulty must be exactly one of: easy, medium, hard.
6. Include an answerKey array with one concise answer per question.
7. Do not place difficulty labels inside question text.

JSON shape:
{
  "schoolName": "Delhi Public School, Sector-4, Bokaro",
  "subject": "${input.subject}",
  "className": "${input.className}",
  "totalMarks": ${calculatedTotal(input)},
  "duration": ${input.duration || 45},
  "sections": [
    {
      "id": "section-a",
      "title": "Section A - Multiple Choice Questions",
      "instruction": "Attempt all questions. Each question carries 1 mark.",
      "questions": [
        {
          "id": "q1",
          "text": "Question text",
          "difficulty": "easy",
          "marks": 1,
          "type": "Multiple Choice Questions"
        }
      ]
    }
  ],
  "answerKey": [
    { "questionId": "q1", "answer": "Concise answer" }
  ]
}`;
}

function extractJson(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);

  return trimmed;
}

function normalizePaper(parsed: GeneratedPaper, input: GenerationInput): GeneratedPaper {
  if (!parsed || !Array.isArray(parsed.sections)) {
    throw new Error('AI response missing sections array');
  }

  const sourceAnswers = Array.isArray(parsed.answerKey) ? parsed.answerKey : [];
  const answerKey: { questionId: string; answer: string }[] = [];

  parsed.sections = input.questionTypes.map((qt, sectionIndex) => {
    const source = parsed.sections[sectionIndex] || {
      id: `section-${String.fromCharCode(97 + sectionIndex)}`,
      title: `Section ${String.fromCharCode(65 + sectionIndex)} - ${qt.type}`,
      instruction: getInstruction(qt),
      questions: [],
    };

    const questions = Array.isArray(source.questions) ? source.questions.slice(0, qt.count) : [];
    while (questions.length < qt.count) {
      const mock = buildMockQuestion(input, qt, sectionIndex, questions.length);
      questions.push(mock.question);
    }

    const normalizedQuestions = questions.map((question, questionIndex) => {
      const id = `s${sectionIndex + 1}q${questionIndex + 1}`;
      const difficulty = normalizeDifficulty(question.difficulty, sectionIndex, questionIndex, input.questionTypes);
      const normalized = {
        id,
        text: question.text || buildQuestionText(qt.type, input.subject, questionIndex + 1),
        difficulty,
        marks: qt.marks,
        type: qt.type,
      };

      const sourceAnswer =
        sourceAnswers.find((answer) => answer.questionId === question.id || answer.questionId === id) ||
        sourceAnswers[answerKey.length];

      answerKey.push({
        questionId: id,
        answer: sourceAnswer?.answer || buildAnswer(qt.type, input.subject, questionIndex + 1),
      });

      return normalized;
    });

    return {
      id: source.id || `section-${String.fromCharCode(97 + sectionIndex)}`,
      title: source.title || `Section ${String.fromCharCode(65 + sectionIndex)} - ${qt.type}`,
      instruction: source.instruction || getInstruction(qt),
      questions: normalizedQuestions,
    };
  });

  return {
    schoolName: parsed.schoolName || 'Delhi Public School, Sector-4, Bokaro',
    subject: input.subject,
    className: input.className,
    totalMarks: calculatedTotal(input),
    duration: input.duration || 45,
    sections: parsed.sections,
    answerKey,
  };
}

export async function generateQuestionPaper(input: GenerationInput): Promise<GeneratedPaper> {
  try {
    const geminiModel = getModel();
    const prompt = buildPrompt(input);
    const result = await geminiModel.generateContent(prompt);
    const response = result.response.text();
    const parsed = JSON.parse(extractJson(response)) as GeneratedPaper;
    return normalizePaper(parsed, input);
  } catch (err) {
    if (isMissingApiKeyError(err)) {
      console.warn('No valid GEMINI_API_KEY — using mock generator');
      return generateMockPaper(input);
    }

    throw err instanceof Error ? err : new Error(String(err));
  }
}

function isMissingApiKeyError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('GEMINI_API_KEY') || message.includes('API key not valid');
}

export function generateMockPaper(input: GenerationInput): GeneratedPaper {
  const answerKey: { questionId: string; answer: string }[] = [];
  const sections = input.questionTypes.map((qt, sectionIndex) => {
    const questions: GeneratedQuestion[] = [];

    for (let questionIndex = 0; questionIndex < qt.count; questionIndex++) {
      const built = buildMockQuestion(input, qt, sectionIndex, questionIndex);
      questions.push(built.question);
      answerKey.push(built.answer);
    }

    return {
      id: `section-${String.fromCharCode(97 + sectionIndex)}`,
      title: `Section ${String.fromCharCode(65 + sectionIndex)} - ${qt.type}`,
      instruction: getInstruction(qt),
      questions,
    };
  });

  return {
    schoolName: 'Delhi Public School, Sector-4, Bokaro',
    subject: input.subject,
    className: input.className,
    totalMarks: calculatedTotal(input),
    duration: input.duration || 45,
    sections,
    answerKey,
  };
}

function buildMockQuestion(input: GenerationInput, qt: QuestionType, sectionIndex: number, questionIndex: number) {
  const id = `s${sectionIndex + 1}q${questionIndex + 1}`;
  const referenceTopic = pickReferenceTopic(input.contentText, questionIndex);
  return {
    question: {
      id,
      text: buildQuestionText(qt.type, input.subject, questionIndex + 1, referenceTopic),
      difficulty: normalizeDifficulty(undefined, sectionIndex, questionIndex, input.questionTypes),
      marks: qt.marks,
      type: qt.type,
    },
    answer: {
      questionId: id,
      answer: buildAnswer(qt.type, input.subject, questionIndex + 1, referenceTopic),
    },
  };
}

function normalizeDifficulty(
  difficulty: unknown,
  sectionIndex: number,
  questionIndex: number,
  questionTypes: QuestionType[]
): 'easy' | 'medium' | 'hard' {
  if (difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard') return difficulty;

  const globalIndex =
    questionTypes.slice(0, sectionIndex).reduce((sum, qt) => sum + qt.count, 0) + questionIndex;
  const total = Math.max(1, questionTypes.reduce((sum, qt) => sum + qt.count, 0));
  const ratio = globalIndex / total;

  if (ratio < 0.4) return 'easy';
  if (ratio < 0.8) return 'medium';
  return 'hard';
}

function getInstruction(qt: QuestionType): string {
  return `Attempt all questions. Each question carries ${qt.marks} ${qt.marks === 1 ? 'mark' : 'marks'}.`;
}

function pickReferenceTopic(contentText: string | undefined, index: number) {
  if (!contentText) return '';

  const sentences = contentText
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 35 && sentence.length <= 220);

  if (sentences.length === 0) {
    return contentText.replace(/\s+/g, ' ').slice(0, 160).trim();
  }

  return sentences[index % sentences.length];
}

function buildQuestionText(type: string, subject: string, num: number, referenceTopic = ''): string {
  const context = referenceTopic ? ` from the uploaded material: "${referenceTopic}"` : ` from ${subject}`;
  const templates: Record<string, string[]> = {
    'Multiple Choice Questions': [
      `Which option best explains the key idea${context}?`,
      `Choose the correct statement related to the concept${context}.`,
      `Identify the most suitable answer for the idea${context}.`,
      `Which example correctly applies the principle${context}?`,
    ],
    'Short Answer Questions': [
      `Define the important concept${context} in two or three sentences.`,
      `State two features of the topic${context}.`,
      `Explain why the concept${context} is useful in real situations.`,
      `Write a brief note on one application of the idea${context}.`,
    ],
    'Long Answer Questions': [
      `Explain the topic${context} in detail with suitable examples.`,
      `Compare two important ideas${context} and support your answer with reasons.`,
      `Describe the process involved in the topic${context} step by step.`,
    ],
    'Diagram-based Questions': [
      `Draw a neat, labelled diagram for the main process${context}.`,
      `Sketch and explain the structure or model related to the topic${context}.`,
    ],
    'Numerical Problems': [
      `Solve a numerical problem based on the topic${context}, using the correct formula and showing all steps.`,
      `A value is given in a situation${context}. Calculate the required result and state the unit.`,
    ],
    'Fill in the Blanks': [
      `Fill in the blank using the uploaded material: A core idea${context} is ________.`,
      `Fill in the blank: The result of the process${context} is ________.`,
    ],
    'True / False': [
      `State whether the following statement is true or false and correct it if false: This is a key concept${context}.`,
      `True or false: The method${context} can be applied only in one situation.`,
    ],
    'Match the Following': [
      `Match the terms${context} in Column A with the correct descriptions in Column B.`,
      `Match each concept${context} with its correct example.`,
    ],
  };

  const questions = templates[type] || [`Answer the following question on ${subject}.`];
  return questions[(num - 1) % questions.length];
}

function buildAnswer(type: string, subject: string, num: number, referenceTopic = ''): string {
  const context = referenceTopic || `the relevant ${subject} concept`;
  if (type === 'Multiple Choice Questions') return `Correct option based on ${context}.`;
  if (type === 'True / False') return `True/False with correction where required.`;
  if (type === 'Numerical Problems') return `Use the correct formula, substitute values, calculate, and include units.`;
  if (type === 'Diagram-based Questions') return `A neat labelled diagram with a short explanation.`;
  return `Expected answer covering ${context} for question ${num}.`;
}
