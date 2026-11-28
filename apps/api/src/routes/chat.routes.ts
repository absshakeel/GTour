import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { authenticate, type AuthRequest } from '../middleware/auth.middleware';
import { getChatStatus, postChat } from '../controllers/chat.controller';

const router: Router = Router();

/**
 * Chat is far more expensive than a normal read: every turn calls a paid
 * provider. The limit is per authenticated user so one visitor cannot drain
 * the shared quota, and it is separate from the global limiter so a busy chat
 * cannot lock the rest of the site out.
 */
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  // `ipKeyGenerator` normalises IPv6 addresses so one host cannot bypass the
  // limit by rotating through its own address block.
  keyGenerator: (req) => (req as AuthRequest).user?.userId ?? ipKeyGenerator(req.ip ?? ''),
  message: {
    success: false,
    error: {
      message: 'Too many assistant messages. Please wait a few minutes.',
      code: 'RATE_LIMITED',
    },
  },
});

router.get('/status', getChatStatus);
router.post('/', authenticate, chatLimiter, postChat);

export default router;
