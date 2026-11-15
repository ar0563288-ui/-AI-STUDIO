import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { AuthenticatedRequest, requireAuth } from '../auth.ts';
import { db, deductCredits, refundCredits } from '../db.ts';
import { ALLOWED_CHAT_MODELS, formatGeminiError, streamChatResponse } from '../gemini.ts';

export const chatRouter = Router();
chatRouter.use(requireAuth);

chatRouter.get('/threads', (req: AuthenticatedRequest, res: Response) => {
  const threads = db
    .prepare('SELECT * FROM chat_threads WHERE user_id = ? ORDER BY updated_at DESC')
    .all(req.userId);
  res.json({ threads });
});

chatRouter.post('/threads', (req: AuthenticatedRequest, res: Response) => {
  const { title, model, systemPrompt } = req.body as {
    title?: string;
    model?: string;
    systemPrompt?: string;
  };
  const safeModel = model && (ALLOWED_CHAT_MODELS as readonly string[]).includes(model) ? model : 'gemini-4-hydrogen';
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO chat_threads (id, user_id, title, model, system_prompt, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    req.userId,
    (title || 'Untitled Conversation').trim(),
    safeModel,
    systemPrompt || '',
    now,
    now
  );

  const thread = db.prepare('SELECT * FROM chat_threads WHERE id = ?').get(id);
  res.status(201).json({ thread });
});

chatRouter.patch('/threads/:id', (req: AuthenticatedRequest, res: Response) => {
  const { title, model, systemPrompt } = req.body as {
    title?: string;
    model?: string;
    systemPrompt?: string;
  };
  const thread = db
    .prepare('SELECT * FROM chat_threads WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!thread) {
    res.status(404).json({ error: 'Conversation thread not found.' });
    return;
  }

  const now = new Date().toISOString();
  if (title) {
    db.prepare('UPDATE chat_threads SET title = ?, updated_at = ? WHERE id = ?').run(title.trim(), now, req.params.id);
  }
  if (model && (ALLOWED_CHAT_MODELS as readonly string[]).includes(model)) {
    db.prepare('UPDATE chat_threads SET model = ?, updated_at = ? WHERE id = ?').run(model, now, req.params.id);
  }
  if (typeof systemPrompt === 'string') {
    db.prepare('UPDATE chat_threads SET system_prompt = ?, updated_at = ? WHERE id = ?').run(systemPrompt, now, req.params.id);
  }

  const updated = db.prepare('SELECT * FROM chat_threads WHERE id = ?').get(req.params.id);
  res.json({ thread: updated });
});

chatRouter.delete('/threads/:id', (req: AuthenticatedRequest, res: Response) => {
  const info = db
    .prepare('DELETE FROM chat_threads WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.userId);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Conversation thread not found.' });
    return;
  }
  res.json({ deleted: true });
});

chatRouter.get('/threads/:id/messages', (req: AuthenticatedRequest, res: Response) => {
  const thread = db
    .prepare('SELECT id FROM chat_threads WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!thread) {
    res.status(404).json({ error: 'Conversation thread not found.' });
    return;
  }
  const messages = db
    .prepare('SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at ASC')
    .all(req.params.id);
  res.json({ messages });
});

chatRouter.post('/threads/:id/messages', async (req: AuthenticatedRequest, res: Response) => {
  const thread = db
    .prepare('SELECT * FROM chat_threads WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId) as
    | { id: string; title: string; model: string; system_prompt: string }
    | undefined;

  if (!thread) {
    res.status(404).json({ error: 'Conversation thread not found.' });
    return;
  }

  const { content, model, attachmentText, attachmentName, attachmentBase64, attachmentMimeType } = req.body as {
    content?: string;
    model?: string;
    attachmentText?: string;
    attachmentName?: string;
    attachmentBase64?: string;
    attachmentMimeType?: string;
  };

  if (!content || !content.trim()) {
    res.status(400).json({ error: 'Message content cannot be empty.' });
    return;
  }

  const activeModel = model && (ALLOWED_CHAT_MODELS as readonly string[]).includes(model) ? model : thread.model;
  const creditCost = activeModel === 'gemini-4-carbon' ? 3 : activeModel === 'gemini-4-argon' ? 2 : 1;

  if (!deductCredits(req.userId!, 'chat', creditCost, `AI Chat (${activeModel})`)) {
    res.status(402).json({ error: 'Insufficient Chat credits for this model.' });
    return;
  }

  const now = new Date().toISOString();
  const userMsgId = crypto.randomUUID();
  const attachments = attachmentName ? [{ name: attachmentName, mimeType: attachmentMimeType || 'text/plain' }] : [];

  db.prepare(`
    INSERT INTO chat_messages (id, thread_id, role, content, attachments_json, tokens_used, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userMsgId, thread.id, 'user', content.trim(), JSON.stringify(attachments), 0, now);

  if (thread.title === 'New Conversation' || thread.title === 'Untitled Conversation') {
    const autoTitle = content.trim().slice(0, 48) + (content.trim().length > 48 ? '...' : '');
    db.prepare('UPDATE chat_threads SET title = ?, model = ?, updated_at = ? WHERE id = ?').run(
      autoTitle,
      activeModel,
      now,
      thread.id
    );
  }

  const history = db
    .prepare('SELECT role, content FROM chat_messages WHERE thread_id = ? AND id != ? ORDER BY created_at ASC')
    .all(thread.id, userMsgId) as Array<{ role: 'user' | 'assistant'; content: string }>;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let fullReply = '';

  try {
    for await (const chunk of streamChatResponse({
      model: activeModel,
      systemInstruction: thread.system_prompt,
      history,
      message: content.trim(),
      attachmentText,
      attachmentInline:
        attachmentBase64 && attachmentMimeType
          ? { data: attachmentBase64, mimeType: attachmentMimeType }
          : undefined,
    })) {
      fullReply += chunk;
      res.write(`data: ${JSON.stringify({ type: 'delta', text: chunk })}\n\n`);
    }

    const assistantMsgId = crypto.randomUUID();
    const doneTime = new Date().toISOString();
    const approxTokens = Math.max(1, Math.ceil(fullReply.length / 4));

    db.prepare(`
      INSERT INTO chat_messages (id, thread_id, role, content, attachments_json, tokens_used, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(assistantMsgId, thread.id, 'assistant', fullReply, '[]', approxTokens, doneTime);

    db.prepare('UPDATE chat_threads SET updated_at = ? WHERE id = ?').run(doneTime, thread.id);

    res.write(
      `data: ${JSON.stringify({
        type: 'done',
        messageId: assistantMsgId,
        tokensUsed: approxTokens,
      })}\n\n`
    );
    res.end();
  } catch (err) {
    refundCredits(req.userId!, 'chat', creditCost, `Refund failed AI Chat (${activeModel})`);
    const formatted = formatGeminiError(err);
    res.write(`data: ${JSON.stringify({ type: 'error', error: formatted.message })}\n\n`);
    res.end();
  }
});
