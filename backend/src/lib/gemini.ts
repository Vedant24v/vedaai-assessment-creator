import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

interface QuestionType {
  type: string;
  count: number;
  marks: number;
}

interface GenerationInput {
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

let genAI: GoogleGenerativeAI;
let model: GenerativeModel;

function getModel(): GenerativeModel {
  if (!model) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      throw new Error('GEMINI_API_KEY not configured. Please add your Gemini API key to the .env file.');
    }
    genAI = new GoogleGenerativeAI(apiKey);
    model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }
  return model;
}

function buildPrompt(input: GenerationInput): string {
  const questionTypesSummary = input.questionTypes
    .map(qt => `- ${qt.type}: ${qt.count} questions × ${qt.marks} mark(s) each`)
    .join('\n');

  const totalQuestions = input.questionTypes.reduce((sum, qt) => sum + qt.count, 0);
  const calculatedTotal = input.questionTypes.reduce((sum, qt) => sum + qt.count * qt.marks, 0);

  return `You are an expert educational assessment creator. Generate a structured question paper in valid JSON format.

ASSIGNMENT DETAILS:
- Subject: ${input.subject}
- Class: ${input.className}
- Total Marks: ${input.totalMarks || calculatedTotal}
- Duration: ${input.duration || 45} minutes
- Total Questions: ${totalQuestions}

QUESTION TYPES REQUIRED:
${questionTypesSummary}

${input.additionalInstructions ? `ADDITIONAL INSTRUCTIONS:\n${input.additionalInstructions}\n` : ''}
${input.contentText ? `REFERENCE CONTENT:\n${input.contentText.substring(0, 2000)}\n` : ''}

IMPORTANT RULES:
1. Generate EXACTLY the number of questions specified for each type
2. Assign difficulty: approximately 40% easy, 40% medium, 20% hard
3. Questions should be appropriate for the subject and class level
4. Group questions into sections (Section A for first type, Section B for second, etc.)
5. Each section must have a clear instruction line
6. Do NOT include difficulty in the question text

Respond with ONLY a valid JSON object (no markdown, no explanation) in this exact format:
{
  "schoolName": "Delhi Public School",
  "subject": "${input.subject}",
  "className": "${input.className}",
  "totalMarks": ${input.totalMarks || calculatedTotal},
  "duration": ${input.duration || 45},
  "sections": [
    {
      "id": "section-a",
      "title": "Section A",
      "instruction": "Attempt all questions. Each question carries N marks.",
      "questions": [
        {
          "id": "q1",
          "text": "Question text here",
          "difficulty": "easy",
          "marks": 1,
          "type": "Multiple Choice Questions"
        }
      ]
    }
  ],
  "answerKey": [
    {
      "questionId": "q1",
      "answer": "Answer text here"
    }
  ]
}`;
}

export async function generateQuestionPaper(input: GenerationInput): Promise<GeneratedPaper> {
  const geminiModel = getModel();
  const prompt = buildPrompt(input);

  console.log('🤖 Calling Gemini AI for question generation...');
  
  const result = await geminiModel.generateContent(prompt);
  const response = result.response.text();
  
  // Clean up the response - remove markdown code blocks if present
  let cleanJson = response.trim();
  if (cleanJson.startsWith('```json')) {
    cleanJson = cleanJson.replace(/^```json\n?/, '').replace(/\n?```$/, '');
  } else if (cleanJson.startsWith('```')) {
    cleanJson = cleanJson.replace(/^```\n?/, '').replace(/\n?```$/, '');
  }

  let parsed: GeneratedPaper;
  try {
    parsed = JSON.parse(cleanJson) as GeneratedPaper;
  } catch {
    console.error('Failed to parse Gemini response:', cleanJson.substring(0, 500));
    throw new Error('AI returned invalid JSON response. Please try again.');
  }

  // Validate structure
  if (!parsed.sections || !Array.isArray(parsed.sections)) {
    throw new Error('AI response missing sections array');
  }

  // Ensure all questions have IDs
  parsed.sections.forEach((section, si) => {
    section.questions.forEach((q, qi) => {
      if (!q.id) q.id = `s${si + 1}q${qi + 1}`;
    });
  });

  console.log(`✅ Generated paper with ${parsed.sections.length} sections`);
  return parsed;
}

// Fallback: generate without AI (for demo/testing when no API key)
export function generateMockPaper(input: GenerationInput): GeneratedPaper {
  const sections: GeneratedSection[] = [];
  const answerKey: { questionId: string; answer: string }[] = [];

  const difficulties: ('easy' | 'medium' | 'hard')[] = ['easy', 'medium', 'hard'];
  const sectionLetters = ['A', 'B', 'C', 'D', 'E'];

  input.questionTypes.forEach((qt, sectionIdx) => {
    const sectionQuestions: GeneratedQuestion[] = [];

    for (let i = 0; i < qt.count; i++) {
      const difficulty = difficulties[Math.floor((i / qt.count) * 3)] || 'medium';
      const qId = `s${sectionIdx + 1}q${i + 1}`;
      
      sectionQuestions.push({
        id: qId,
        text: getSampleQuestion(qt.type, input.subject, i + 1),
        difficulty,
        marks: qt.marks,
        type: qt.type,
      });

      answerKey.push({
        questionId: qId,
        answer: `Sample answer for question ${i + 1}`,
      });
    }

    sections.push({
      id: `section-${sectionLetters[sectionIdx]?.toLowerCase() || sectionIdx}`,
      title: `Section ${sectionLetters[sectionIdx] || sectionIdx + 1}`,
      instruction: getInstruction(qt.type),
      questions: sectionQuestions,
    });
  });

  return {
    schoolName: 'Delhi Public School',
    subject: input.subject,
    className: input.className,
    totalMarks: input.totalMarks,
    duration: input.duration,
    sections,
    answerKey,
  };
}

function getSampleQuestion(type: string, subject: string, num: number): string {
  const questionMap: Record<string, string[]> = {
    'Multiple Choice Questions': [
      `Which of the following best describes ${subject}?`,
      `What is the primary purpose of ${subject} concepts?`,
      `Which statement about ${subject} is correct?`,
      `In the context of ${subject}, what does the term refer to?`,
    ],
    'Short Answer Questions': [
      `Explain the importance of ${subject} in everyday life.`,
      `Define the key concept in ${subject} studied this semester.`,
      `Describe two applications of ${subject}.`,
      `What are the main characteristics of ${subject}?`,
    ],
    'Diagram-based Questions': [
      `Draw and label a diagram representing the main concept in ${subject}.`,
      `Sketch and explain the process discussed in ${subject}.`,
    ],
    'Numerical Problems': [
      `Solve the following problem related to ${subject}: Calculate the value given the data provided.`,
      `A practical scenario in ${subject} requires you to compute the result.`,
    ],
  };

  const questions = questionMap[type] || [`Question ${num} on ${subject}`];
  return questions[(num - 1) % questions.length];
}

function getInstruction(type: string): string {
  const instructions: Record<string, string> = {
    'Multiple Choice Questions': 'Choose the correct option for each question. Each question carries equal marks.',
    'Short Answer Questions': 'Answer all questions briefly. Write your answers clearly.',
    'Diagram-based Questions': 'Draw neat, well-labelled diagrams wherever required.',
    'Numerical Problems': 'Show all working steps. Marks may be awarded for correct method.',
    'Long Answer Questions': 'Answer in detail. Support your answers with examples where possible.',
  };
  return instructions[type] || 'Attempt all questions in this section.';
}
