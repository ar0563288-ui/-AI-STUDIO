import bcrypt from 'bcryptjs';
import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { db, grantCredits, sanitizeUser, UserRow } from './db.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'aistudio-local-dev-secret-change-in-production';

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '14d' });
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Sign in to access AI STUDIO.' });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub?: string };
    if (!payload.sub) {
      res.status(401).json({ error: 'Invalid authentication token.' });
      return;
    }
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(payload.sub);
    if (!user) {
      res.status(401).json({ error: 'Account not found.' });
      return;
    }
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired or invalid token.' });
  }
}

export const authRouter = Router();

authRouter.post('/register', (req: Request, res: Response) => {
  const { email, password, fullName } = req.body as {
    email?: string;
    password?: string;
    fullName?: string;
  };

  if (!email || !password || password.length < 6) {
    res.status(400).json({ error: 'Valid email and password (min 6 characters) are required.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const hash = bcrypt.hashSync(password, 10);
  const displayName = (fullName || normalizedEmail.split('@')[0]).trim();

  db.prepare(`
    INSERT INTO users (
      id, email, password_hash, full_name, avatar_url, plan_tier,
      credits_chat, credits_image, credits_video, credits_music, credits_voice,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    normalizedEmail,
    hash,
    displayName,
    '/src/assets/images/avatar_studio_creator_1794729447526.jpg',
    'free',
    250,
    40,
    20,
    20,
    50,
    now,
    now
  );

  db.prepare(`
    INSERT INTO credit_transactions (id, user_id, category, amount, balance_after, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), userId, 'grant', 380, 380, 'Free Account Welcome Credits', now);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow;
  const token = signToken(userId);
  res.status(201).json({ token, user: sanitizeUser(user) });
});

authRouter.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail) as UserRow | undefined;
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const token = signToken(user.id);
  res.json({ token, user: sanitizeUser(user) });
});

authRouter.post('/demo', (_req: Request, res: Response) => {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get('creator@aistudio.dev') as UserRow | undefined;
  if (!user) {
    res.status(404).json({ error: 'Demo workspace unavailable.' });
    return;
  }
  const token = signToken(user.id);
  res.json({ token, user: sanitizeUser(user) });
});

authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as UserRow | undefined;
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  res.json({ user: sanitizeUser(user) });
});

authRouter.patch('/profile', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { fullName, avatarUrl } = req.body as { fullName?: string; avatarUrl?: string };
  const now = new Date().toISOString();
  if (fullName && fullName.trim()) {
    db.prepare('UPDATE users SET full_name = ?, updated_at = ? WHERE id = ?').run(fullName.trim(), now, req.userId);
  }
  if (avatarUrl && avatarUrl.trim()) {
    db.prepare('UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?').run(avatarUrl.trim(), now, req.userId);
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as UserRow;
  res.json({ user: sanitizeUser(user) });
});

// Subscription-ready architecture: NEVER modifies plan or charges without explicit confirmation flag
authRouter.post('/credits/confirm-upgrade', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { planTier, explicitConfirmation } = req.body as {
    planTier?: 'free' | 'pro' | 'studio';
    explicitConfirmation?: boolean;
  };

  if (explicitConfirmation !== true) {
    res.status(400).json({
      error: 'Explicit user payment confirmation is required before upgrading plans or adding paid credits.',
    });
    return;
  }

  if (planTier !== 'pro' && planTier !== 'studio' && planTier !== 'free') {
    res.status(400).json({ error: 'Invalid subscription tier selected.' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE users SET plan_tier = ?, updated_at = ? WHERE id = ?').run(planTier, now, req.userId);

  if (planTier === 'pro') {
    grantCredits(
      req.userId!,
      { chat: 1000, image: 150, video: 60, music: 60, voice: 200 },
      'Pro Creator Plan Confirmed Credit Allocation'
    );
  } else if (planTier === 'studio') {
    grantCredits(
      req.userId!,
      { chat: 5000, image: 600, video: 240, music: 240, voice: 1000 },
      'Studio Enterprise Plan Confirmed Credit Allocation'
    );
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as UserRow;
  res.json({ user: sanitizeUser(user), confirmed: true });
});
