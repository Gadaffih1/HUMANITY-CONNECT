import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest, writeAuditLog } from '../middleware/auth.ts';
import { assistHumanitarianText } from '../lib/gemini.ts';

export const aiRouter = Router();

const aiSchema = z.object({
  mode: z.enum([
    'STORY_WRITING',
    'AUDIO_TRANSCRIPTION',
    'TRANSLATE_SW_EN',
    'NEED_CATEGORISATION',
    'NEED_TRIAGE_ADVISORY',
    'DUPLICATE_DETECTION',
    'BENEFICIARY_MATCHING',
    'CASE_SUMMARISATION',
    'IMPACT_BRIEF',
    'GENERAL_ASSIST',
    'INTAKE_SUMMARY',
  ]),
  text: z.string().min(1).max(6000),
  language: z.enum(['en', 'sw']).optional(),
  context: z.string().max(1500).optional(),
  audioBase64: z.string().optional(),
  audioMimeType: z.string().optional(),
});

aiRouter.post('/assist', requireAuth, async (req: AuthRequest, res) => {
  try {
    const parsed = aiSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Provide valid mode and input for AI assistance.' });
    }
    const result = await assistHumanitarianText(parsed.data);
    await writeAuditLog({
      actorUserId: req.authUser!.userId,
      actorRole: req.authUser!.activeRole,
      action: 'AI_RECOMMENDATION_LOGGED',
      entityType: 'ai_service',
      ip: req.ip,
      details: {
        mode: parsed.data.mode,
        model: result.usedModel,
        advisoryPriority: result.advisoryPriority,
        requiresHumanReview: result.requiresHumanReview,
      },
    });
    res.json(result);
  } catch (err: any) {
    console.error('AI assist error:', err);
    res.status(502).json({ error: err.message || 'AI assistance service temporarily unavailable.' });
  }
});
