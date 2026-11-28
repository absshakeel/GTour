import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { chatRequestSchema } from '@gtour/validation';
import Destination from '../models/Destination';
import { parseOrThrow } from '../utils/http';
import { aiConfig } from '../services/ai/config';
import { streamChatAnswer } from '../services/ai/stream.service';

/**
 * Grounds the answer in the page the visitor is looking at, so "how do I get
 * there" works on a destination page without the visitor repeating the name.
 * Only public fields are read, and the destination must not be archived.
 */
async function pageContext(destinationId?: string): Promise<string | undefined> {
  if (!destinationId || !mongoose.isValidObjectId(destinationId)) return undefined;

  const destination = await Destination.findOne({ _id: destinationId, archived_at: null })
    .select('name description best_visit_season estimated_budget')
    .lean();
  if (!destination) return undefined;

  const parts = [`The visitor is viewing the destination "${destination.name}".`];
  if (destination.best_visit_season) parts.push(`Best season: ${destination.best_visit_season}.`);
  if (destination.estimated_budget) parts.push(`Typical budget: ${destination.estimated_budget} BDT.`);
  if (destination.description) parts.push(`Description: ${destination.description.slice(0, 400)}`);
  return parts.join(' ');
}

/**
 * @openapi
 * /chat:
 *   post:
 *     summary: Ask the tourism assistant a question
 *     description: >
 *       Streams an answer as Server-Sent Events. The conversation is stateless:
 *       the client replays recent turns on every request and the server stores
 *       nothing. The assistant may search destinations, hotels, rooms,
 *       photographers, and vehicles, and may prepare a hotel booking draft, but
 *       it can never create a booking. Creating one still requires the visitor
 *       to press Confirm in the booking form, where the server revalidates
 *       availability and recalculates the price.
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [messages]
 *             properties:
 *               messages:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 20
 *                 description: Recent turns, oldest first. A `system` role is rejected.
 *                 items:
 *                   type: object
 *                   required: [role, content]
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                     content:
 *                       type: string
 *                       maxLength: 4000
 *               destination_id:
 *                 type: string
 *                 description: Destination currently being viewed, used to ground the answer.
 *     responses:
 *       200:
 *         description: >
 *           An SSE stream. Event names are `token` (answer text), `status`
 *           (a tool started), `draft` (a priced booking draft awaiting
 *           confirmation), `notice`, `error`, and `done`.
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       429:
 *         description: Too many requests
 *       503:
 *         description: Assistant unavailable
 */
export async function postChat(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = parseOrThrow(chatRequestSchema, req.body);
    const context = await pageContext(body.destination_id);

    await streamChatAnswer({
      res,
      turns: body.messages,
      context,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * @openapi
 * /chat/status:
 *   get:
 *     summary: Check whether the tourism assistant is available
 *     tags: [Chat]
 *     responses:
 *       200:
 *         description: Availability of the assistant
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 available:
 *                   type: boolean
 *                 model:
 *                   type: string
 *                   nullable: true
 */
export function getChatStatus(_req: Request, res: Response): void {
  res.json({
    success: true,
    available: aiConfig.enabled,
    // The model name is not a secret and helps debugging, but the key never
    // appears in any response.
    model: aiConfig.enabled ? aiConfig.modelId : null,
  });
}
