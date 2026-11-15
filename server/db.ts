import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'aistudio.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      avatar_url TEXT DEFAULT '/src/assets/images/avatar_studio_creator_1794729447526.jpg',
      plan_tier TEXT NOT NULL DEFAULT 'free',
      credits_chat INTEGER NOT NULL DEFAULT 250,
      credits_image INTEGER NOT NULL DEFAULT 40,
      credits_video INTEGER NOT NULL DEFAULT 20,
      credits_music INTEGER NOT NULL DEFAULT 20,
      credits_voice INTEGER NOT NULL DEFAULT 50,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT DEFAULT '',
      thumbnail_url TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_threads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT 'gemini-4-hydrogen',
      system_prompt TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      attachments_json TEXT NOT NULL DEFAULT '[]',
      tokens_used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generation_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      job_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      progress INTEGER NOT NULL DEFAULT 0,
      step_label TEXT NOT NULL DEFAULT 'Queued',
      prompt TEXT NOT NULL,
      params_json TEXT NOT NULL DEFAULT '{}',
      output_url TEXT,
      output_meta_json TEXT NOT NULL DEFAULT '{}',
      credits_cost INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT REFERENCES generation_jobs(id) ON DELETE SET NULL,
      file_name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      format TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credit_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_threads_user ON chat_threads(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON chat_messages(thread_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_jobs_user ON generation_jobs(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_downloads_user ON downloads(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_credits_user ON credit_transactions(user_id, created_at DESC);
  `);

  // Seed default demo workspace user if none exists
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('creator@aistudio.dev');
  if (!existing) {
    const now = new Date().toISOString();
    const userId = crypto.randomUUID();
    const passwordHash = bcrypt.hashSync('Studio2026!', 10);

    db.prepare(`
      INSERT INTO users (
        id, email, password_hash, full_name, avatar_url, plan_tier,
        credits_chat, credits_image, credits_video, credits_music, credits_voice,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      'creator@aistudio.dev',
      passwordHash,
      'Elena Vance',
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
    `).run(crypto.randomUUID(), userId, 'grant', 380, 380, 'Initial Free Studio Welcome Allocation', now);

    const projectId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO projects (id, user_id, title, type, description, thumbnail_url, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      projectId,
      userId,
      'Obsidian Horizon Launch Film',
      'video',
      'Multi-scene 60s launch campaign across YouTube 16:9 and TikTok 9:16 ratios.',
      '/src/assets/images/showcase_cinematic_frame_1794729447424.jpg',
      JSON.stringify({ aspectRatio: '16:9', targetDuration: 60 }),
      now,
      now
    );

    const threadId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO chat_threads (id, user_id, title, model, system_prompt, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      threadId,
      userId,
      'Launch Campaign Creative Brief',
      'gemini-4-hydrogen',
      'You are an executive creative director helping plan multimodal video, image, and music campaigns.',
      now,
      now
    );

    db.prepare(`
      INSERT INTO chat_messages (id, thread_id, role, content, attachments_json, tokens_used, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      threadId,
      'assistant',
      'Welcome to AI STUDIO. Tell me about the campaign, video script, visual concept, or track you want to produce, and we can route each asset directly into Image, Video, Music, or Voice Studio.',
      '[]',
      38,
      now
    );
  }
}

export type CreditCategory = 'chat' | 'image' | 'video' | 'music' | 'voice';

const CREDIT_COLUMN_MAP: Record<CreditCategory, string> = {
  chat: 'credits_chat',
  image: 'credits_image',
  video: 'credits_video',
  music: 'credits_music',
  voice: 'credits_voice',
};

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  avatar_url: string;
  plan_tier: 'free' | 'pro' | 'studio';
  credits_chat: number;
  credits_image: number;
  credits_video: number;
  credits_music: number;
  credits_voice: number;
  created_at: string;
  updated_at: string;
}

export function sanitizeUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    fullName: u.full_name,
    avatarUrl: u.avatar_url,
    planTier: u.plan_tier,
    credits: {
      chat: u.credits_chat,
      image: u.credits_image,
      video: u.credits_video,
      music: u.credits_music,
      voice: u.credits_voice,
      total: u.credits_chat + u.credits_image + u.credits_video + u.credits_music + u.credits_voice,
    },
    createdAt: u.created_at,
    updatedAt: u.updated_at,
  };
}

export function deductCredits(userId: string, category: CreditCategory, cost: number, description: string): boolean {
  const col = CREDIT_COLUMN_MAP[category];
  const tx = db.transaction(() => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;
    if (!user) return false;
    const current = (user as unknown as Record<string, number>)[col];
    if (current < cost) return false;
    const next = current - cost;
    const now = new Date().toISOString();
    db.prepare(`UPDATE users SET ${col} = ?, updated_at = ? WHERE id = ?`).run(next, now, userId);
    db.prepare(`
      INSERT INTO credit_transactions (id, user_id, category, amount, balance_after, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), userId, category, -cost, next, description, now);
    return true;
  });
  return tx();
}

export function refundCredits(userId: string, category: CreditCategory, cost: number, description: string): void {
  const col = CREDIT_COLUMN_MAP[category];
  const tx = db.transaction(() => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;
    if (!user) return;
    const current = (user as unknown as Record<string, number>)[col];
    const next = current + cost;
    const now = new Date().toISOString();
    db.prepare(`UPDATE users SET ${col} = ?, updated_at = ? WHERE id = ?`).run(next, now, userId);
    db.prepare(`
      INSERT INTO credit_transactions (id, user_id, category, amount, balance_after, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), userId, 'refund', cost, next, description, now);
  });
  tx();
}

export function grantCredits(userId: string, additions: Partial<Record<CreditCategory, number>>, description: string): void {
  const tx = db.transaction(() => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;
    if (!user) return;
    const now = new Date().toISOString();
    let totalAdded = 0;
    for (const [cat, amt] of Object.entries(additions) as [CreditCategory, number][]) {
      if (!amt || amt <= 0) continue;
      const col = CREDIT_COLUMN_MAP[cat];
      const current = (user as unknown as Record<string, number>)[col];
      db.prepare(`UPDATE users SET ${col} = ?, updated_at = ? WHERE id = ?`).run(current + amt, now, userId);
      totalAdded += amt;
    }
    if (totalAdded > 0) {
      const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow;
      const totalBal = updated.credits_chat + updated.credits_image + updated.credits_video + updated.credits_music + updated.credits_voice;
      db.prepare(`
        INSERT INTO credit_transactions (id, user_id, category, amount, balance_after, description, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), userId, 'grant', totalAdded, totalBal, description, now);
    }
  });
  tx();
}
