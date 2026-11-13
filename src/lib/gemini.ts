import { GoogleGenAI, Type } from '@google/genai';

export function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export type GeminiAssistMode =
  | 'STORY_WRITING'
  | 'AUDIO_TRANSCRIPTION'
  | 'TRANSLATE_SW_EN'
  | 'NEED_CATEGORISATION'
  | 'NEED_TRIAGE_ADVISORY'
  | 'DUPLICATE_DETECTION'
  | 'BENEFICIARY_MATCHING'
  | 'CASE_SUMMARISATION'
  | 'IMPACT_BRIEF'
  | 'GENERAL_ASSIST'
  | 'INTAKE_SUMMARY';

export async function assistHumanitarianText(params: {
  mode: GeminiAssistMode;
  text: string;
  language?: 'en' | 'sw';
  context?: string;
  audioBase64?: string;
  audioMimeType?: string;
}): Promise<{
  output: string;
  advisoryPriority?: string;
  advisoryCategory?: string;
  advisoryReasons?: string[];
  requiresHumanReview: boolean;
  usedModel: string;
}> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error(
      'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets.'
    );
  }

  // Strip common direct phone/national ID digits to minimise PII sent to AI
  const redactedText = params.text
    .replace(/\+?\d[\d\s-]{7,14}\d/g, '[REDACTED_PHONE]')
    .replace(/\b\d{7,9}\b/g, '[REDACTED_ID]');

  // Audio Transcription via gemini-3.5-transcribe
  if (params.mode === 'AUDIO_TRANSCRIPTION' && params.audioBase64) {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: params.audioMimeType || 'audio/webm',
              data: params.audioBase64,
            },
          },
          {
            text: 'Transcribe this Kenyan humanitarian beneficiary narration accurately in English or Kiswahili, omitting exact street locations or minor full names.',
          },
        ],
      },
    });
    return {
      output: (response.text ?? '').trim(),
      requiresHumanReview: true,
      usedModel: 'gemini-3.5-transcribe',
    };
  }

  if (params.mode === 'NEED_TRIAGE_ADVISORY' || params.mode === 'NEED_CATEGORISATION') {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Analyze this humanitarian need request in Kenya for ADVISORY officer assistance ONLY.
SAFEGUARD RULE: Never make final eligibility, financial, or child protection decisions. Never recommend auto-rejection.
Context: ${params.context || 'Kenyan household support intake'}
Need narrative: ${redactedText}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            advisoryTier: {
              type: Type.STRING,
              description: 'One of P1_CRITICAL, P2_URGENT, P3_HIGH, P4_MODERATE, P5_DEVELOPMENTAL',
            },
            advisoryCategory: {
              type: Type.STRING,
              description:
                'One of Food, Shelter, Rent, Education, Medical, Family welfare, Disability, Employment, Business empowerment, Agriculture, Emergency, Bereavement, Digital inclusion, Legal assistance, Community development',
            },
            summary: {
              type: Type.STRING,
              description: 'Concise 2-sentence advisory note for human review.',
            },
            reasons: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Up to 4 factual checklist observations for the human reviewer.',
            },
          },
        },
      },
    });
    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      advisoryTier?: string;
      advisoryCategory?: string;
      summary?: string;
      reasons?: string[];
    };
    return {
      output: parsed.summary || 'Advisory prepared for human verification panel.',
      advisoryPriority: parsed.advisoryTier || 'P3_HIGH',
      advisoryCategory: parsed.advisoryCategory || 'Family welfare',
      advisoryReasons: parsed.reasons || [],
      requiresHumanReview: true,
      usedModel: 'gemini-4-hydrogen',
    };
  }

  const instructions: Record<string, string> = {
    STORY_WRITING:
      'Refine this humanitarian story with warmth, dignity, and clarity. Remove minor full names, school names, and exact residential addresses. Output requires human review before publishing.',
    INTAKE_SUMMARY:
      'Refine this beneficiary story cleanly in English or Kiswahili while safeguarding child privacy.',
    TRANSLATE_SW_EN:
      'Translate accurately and respectfully between Kiswahili and English. Preserve dignity and exclude personal identifiers.',
    DUPLICATE_DETECTION:
      'Compare the provided case summaries strictly for potential overlap signals (county, household structure, need narrative) and list verification questions for a human officer. Never recommend automatic rejection.',
    BENEFICIARY_MATCHING:
      'Suggest non-binding supporter/fund pathway alignment notes based on category, urgency, and county without exposing private PII.',
    CASE_SUMMARISATION:
      'Produce a concise, structured 4-bullet case summary for an authorised verification officer.',
    IMPACT_BRIEF:
      'Draft an institutional philanthropy impact report grounded strictly in the provided verified metrics.',
    GENERAL_ASSIST:
      'You are the Humanity Connect humanitarian guidance assistant (English & Kiswahili). Answer clearly about V0-V4 verification, M-Pesa pathways, safeguarding, and empowerment without making binding eligibility decisions.',
    AUDIO_TRANSCRIPTION:
      'Clean and structure this voice narration transcript into clear dignified prose while preserving original meaning.',
  };

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `${params.context ? `Context: ${params.context}\n\n` : ''}${redactedText}`,
    config: {
      systemInstruction: instructions[params.mode] || instructions.GENERAL_ASSIST,
    },
  });

  return {
    output: (response.text ?? '').trim(),
    requiresHumanReview: true,
    usedModel: 'gemini-4-hydrogen',
  };
}
