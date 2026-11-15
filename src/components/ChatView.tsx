import React, { useEffect, useRef, useState } from 'react';
import { Copy, FileText, Paperclip, Plus, Send, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { ChatMessage, ChatThread } from '../types/studio';

interface ChatViewProps {
  onCreditChange: () => void;
}

const CHAT_MODELS = [
  { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen (Fast · 1 cr)' },
  { id: 'gemini-4-argon', label: 'Gemini 4 Argon (Pro · 2 cr)' },
  { id: 'gemini-4-carbon', label: 'Gemini 4 Carbon (Deep · 3 cr)' },
];

export function ChatView({ onCreditChange }: ChatViewProps) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-4-hydrogen');
  const [streaming, setStreaming] = useState(false);
  const [streamingReply, setStreamingReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [attachmentText, setAttachmentText] = useState<string | undefined>(undefined);
  const [attachmentBase64, setAttachmentBase64] = useState<string | undefined>(undefined);
  const [attachmentMimeType, setAttachmentMimeType] = useState<string | undefined>(undefined);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);

  async function loadThreads(selectFirst = false) {
    const res = await api.listThreads();
    setThreads(res.threads);
    if (selectFirst && res.threads.length > 0 && !activeThreadId) {
      setActiveThreadId(res.threads[0].id);
      setSelectedModel(res.threads[0].model || 'gemini-4-hydrogen');
    }
  }

  useEffect(() => {
    loadThreads(true);
  }, []);

  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    api.listMessages(activeThreadId).then((res) => setMessages(res.messages));
  }, [activeThreadId]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingReply]);

  async function handleNewThread() {
    const res = await api.createThread({
      title: 'New Conversation',
      model: selectedModel,
    });
    setThreads((prev) => [res.thread, ...prev]);
    setActiveThreadId(res.thread.id);
    setMessages([]);
    setError(null);
  }

  async function handleDeleteThread(id: string) {
    await api.deleteThread(id);
    const next = threads.filter((t) => t.id !== id);
    setThreads(next);
    if (activeThreadId === id) {
      setActiveThreadId(next[0]?.id ?? null);
    }
  }

  function handleFileAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachmentName(file.name);
    if (file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.csv') || file.name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachmentText(String(reader.result || '').slice(0, 50000));
        setAttachmentBase64(undefined);
        setAttachmentMimeType(undefined);
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.split(',')[1];
        setAttachmentBase64(base64);
        setAttachmentMimeType(file.type || 'application/octet-stream');
        setAttachmentText(undefined);
      };
      reader.readAsDataURL(file);
    }
  }

  function clearAttachment() {
    setAttachmentName(null);
    setAttachmentText(undefined);
    setAttachmentBase64(undefined);
    setAttachmentMimeType(undefined);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || streaming) return;

    setError(null);
    let targetId = activeThreadId;
    if (!targetId) {
      const created = await api.createThread({ title: 'New Conversation', model: selectedModel });
      setThreads((prev) => [created.thread, ...prev]);
      targetId = created.thread.id;
      setActiveThreadId(targetId);
    }

    const userText = input.trim();
    setInput('');

    const optimisticMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      thread_id: targetId,
      role: 'user',
      content: userText,
      attachments_json: attachmentName ? JSON.stringify([{ name: attachmentName }]) : '[]',
      tokens_used: 0,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setStreaming(true);
    setStreamingReply('');

    try {
      await api.streamMessage(
        targetId,
        {
          content: userText,
          model: selectedModel,
          attachmentText,
          attachmentName: attachmentName ?? undefined,
          attachmentBase64,
          attachmentMimeType,
        },
        (delta) => {
          setStreamingReply((prev) => prev + delta);
        }
      );
      clearAttachment();
      const updated = await api.listMessages(targetId);
      setMessages(updated.messages);
      await loadThreads(false);
      onCreditChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stream response');
    } finally {
      setStreaming(false);
      setStreamingReply('');
    }
  }

  function handleCopy(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-148px)] min-h-[560px]">
      {/* Conversation History Sidebar */}
      <aside className="lg:col-span-3 rounded-xl bg-[#0E0A18] border border-violet-500/15 p-4 flex flex-col min-h-0">
        <button
          type="button"
          onClick={handleNewThread}
          className="w-full py-2.5 px-3 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white inline-flex items-center justify-center gap-2 transition-colors mb-4 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Chat Session</span>
        </button>

        <div className="text-xs font-medium text-violet-200/60 mb-2">Conversation History</div>
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {threads.map((t) => {
            const active = t.id === activeThreadId;
            return (
              <div
                key={t.id}
                className={`group flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border transition-colors ${
                  active
                    ? 'bg-violet-600/15 border-violet-500/40 text-white'
                    : 'bg-transparent border-transparent text-violet-200/70 hover:bg-violet-500/10 hover:text-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveThreadId(t.id);
                    setSelectedModel(t.model || 'gemini-4-hydrogen');
                  }}
                  className="flex-1 text-left min-w-0"
                >
                  <div className="text-xs font-medium truncate">{t.title}</div>
                  <div className="text-[11px] font-mono text-violet-300/50 truncate mt-0.5">
                    {new Date(t.updated_at).toLocaleDateString()}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteThread(t.id)}
                  aria-label={`Delete ${t.title}`}
                  className="opacity-60 group-hover:opacity-100 p-1 text-violet-300/60 hover:text-red-300"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Active Chat Viewport */}
      <section className="lg:col-span-9 rounded-xl bg-[#0E0A18] border border-violet-500/15 flex flex-col min-h-0">
        {/* Chat Toolbar */}
        <div className="px-5 py-3.5 border-b border-violet-500/15 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-sm font-medium text-white truncate">
            {threads.find((t) => t.id === activeThreadId)?.title || 'AI Assistant'}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              aria-label="Select AI Model"
              className="px-3 py-1.5 rounded-lg bg-[#08050F] border border-violet-500/25 text-xs text-violet-100 focus:border-violet-500 focus:outline-none"
            >
              {CHAT_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {messages.length === 0 && !streaming && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto py-12">
              <h3 className="text-base font-semibold text-white">AI STUDIO Assistant</h3>
              <p className="text-xs text-violet-200/65 mt-1.5 leading-relaxed">
                Ask questions, draft video scripts, write code, or attach a document (.txt, .md, .csv, .pdf, or image) for analysis.
              </p>
            </div>
          )}

          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            let attList: Array<{ name: string }> = [];
            try {
              attList = JSON.parse(msg.attachments_json || '[]');
            } catch {
              attList = [];
            }
            return (
              <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-violet-600/25 border border-violet-500/35 text-white'
                      : 'bg-[#140F22] border border-violet-500/15 text-violet-50'
                  }`}
                >
                  {attList.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-violet-300 mb-2">
                      <FileText className="w-3.5 h-3.5" />
                      <span>{attList.map((a) => a.name).join(', ')}</span>
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                  {!isUser && (
                    <div className="mt-2 pt-2 border-t border-violet-500/10 flex items-center justify-between text-[11px] text-violet-300/55">
                      <span className="font-mono tabular-nums">
                        {msg.tokens_used > 0 ? `${msg.tokens_used} tokens` : 'Assistant'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(msg.id, msg.content)}
                        className="inline-flex items-center gap-1 hover:text-white transition-colors"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {streaming && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed bg-[#140F22] border border-violet-500/30 text-violet-50 whitespace-pre-wrap">
                {streamingReply || 'Thinking...'}
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-200">
              {error}
            </div>
          )}
          <div ref={scrollEndRef} />
        </div>

        {/* Composer */}
        <form onSubmit={handleSend} className="p-4 border-t border-violet-500/15 shrink-0">
          {attachmentName && (
            <div className="mb-2.5 flex items-center justify-between px-3 py-1.5 rounded-lg bg-[#161026] border border-violet-500/25 text-xs text-violet-200">
              <span className="inline-flex items-center gap-2 truncate">
                <FileText className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                <span className="truncate">{attachmentName}</span>
              </span>
              <button type="button" onClick={clearAttachment} className="text-violet-300 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileAttach}
              accept=".txt,.md,.csv,.json,.pdf,image/*"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach document or image"
              className="p-2.5 rounded-lg bg-[#140F22] hover:bg-[#1D1631] border border-violet-500/20 text-violet-200 transition-colors shrink-0"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              placeholder="Message AI STUDIO Assistant... (Shift+Enter for new line)"
              className="flex-1 resize-none px-3.5 py-2.5 rounded-lg bg-[#08050F] border border-violet-500/20 text-sm text-white placeholder:text-violet-300/35 focus:border-violet-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              className="px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-sm font-medium text-white inline-flex items-center gap-2 transition-colors shrink-0"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
