import {
  ChatMessage,
  ChatThread,
  CreditTransaction,
  DownloadItem,
  GenerationJob,
  ProjectItem,
  UserProfile,
} from '../types/studio';

const TOKEN_KEY = 'aistudio_auth_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || `Request failed (${res.status})` };
  }

  if (!res.ok) {
    throw new Error((data.error as string) || `Request failed with status ${res.status}`);
  }

  return data as T;
}

export const api = {
  // Auth
  demoLogin: () => request<{ token: string; user: UserProfile }>('/api/auth/demo', { method: 'POST' }),
  login: (email: string, password: string) =>
    request<{ token: string; user: UserProfile }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string, fullName: string) =>
    request<{ token: string; user: UserProfile }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName }),
    }),
  me: () => request<{ user: UserProfile }>('/api/auth/me'),
  updateProfile: (payload: { fullName?: string; avatarUrl?: string }) =>
    request<{ user: UserProfile }>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  confirmUpgrade: (planTier: 'free' | 'pro' | 'studio') =>
    request<{ user: UserProfile; confirmed: boolean }>('/api/auth/credits/confirm-upgrade', {
      method: 'POST',
      body: JSON.stringify({ planTier, explicitConfirmation: true }),
    }),

  // Chat
  listThreads: () => request<{ threads: ChatThread[] }>('/api/chat/threads'),
  createThread: (payload: { title?: string; model?: string; systemPrompt?: string }) =>
    request<{ thread: ChatThread }>('/api/chat/threads', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateThread: (id: string, payload: { title?: string; model?: string; systemPrompt?: string }) =>
    request<{ thread: ChatThread }>(`/api/chat/threads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteThread: (id: string) =>
    request<{ deleted: boolean }>(`/api/chat/threads/${id}`, { method: 'DELETE' }),
  listMessages: (threadId: string) =>
    request<{ messages: ChatMessage[] }>(`/api/chat/threads/${threadId}/messages`),

  async streamMessage(
    threadId: string,
    payload: {
      content: string;
      model?: string;
      attachmentText?: string;
      attachmentName?: string;
      attachmentBase64?: string;
      attachmentMimeType?: string;
    },
    onDelta: (text: string) => void
  ): Promise<void> {
    const token = getStoredToken();
    const res = await fetch(`/api/chat/threads/${threadId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error((errData as { error?: string }).error || `Chat stream failed (${res.status})`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('Readable stream unavailable');
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;
        const evt = JSON.parse(jsonStr) as { type: string; text?: string; error?: string };
        if (evt.type === 'delta' && evt.text) {
          onDelta(evt.text);
        } else if (evt.type === 'error') {
          throw new Error(evt.error || 'Chat streaming error');
        }
      }
    }
  },

  // Projects, Jobs, Downloads, Credits
  listProjects: () => request<{ projects: ProjectItem[] }>('/api/studios/projects'),
  createProject: (payload: { title: string; type: string; description?: string; thumbnailUrl?: string }) =>
    request<{ project: ProjectItem }>('/api/studios/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteProject: (id: string) =>
    request<{ deleted: boolean }>(`/api/studios/projects/${id}`, { method: 'DELETE' }),
  listJobs: (type?: string) =>
    request<{ jobs: GenerationJob[] }>(`/api/studios/jobs${type ? `?type=${encodeURIComponent(type)}` : ''}`),
  getJob: (id: string) => request<{ job: GenerationJob }>(`/api/studios/jobs/${id}`),
  listDownloads: () => request<{ downloads: DownloadItem[] }>('/api/studios/downloads'),
  recordDownload: (payload: { jobId?: string; fileName: string; fileUrl: string; format: string }) =>
    request<{ id: string }>('/api/studios/downloads', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listCreditHistory: () => request<{ transactions: CreditTransaction[] }>('/api/studios/credits/history'),

  // Studios
  generateImage: (payload: {
    prompt: string;
    style?: string;
    aspectRatio?: string;
    resolution?: '1K' | '2K' | '4K';
    highQuality?: boolean;
    mode?: 'generate' | 'edit' | 'bg_remove';
    referenceImageBase64?: string;
    referenceMimeType?: string;
  }) =>
    request<{ job: GenerationJob }>('/api/studios/image', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  generateVideo: (payload: {
    prompt: string;
    mode?: 'text' | 'image' | 'script';
    aspectRatio?: string;
    customWidth?: number;
    customHeight?: number;
    resolution?: '360p' | '720p' | '1080p' | '4k';
    targetDurationSec?: number;
    quality?: 'standard' | 'high' | 'ultra';
    includeSubtitles?: boolean;
    referenceImageBase64?: string;
    referenceMimeType?: string;
  }) =>
    request<{ job: GenerationJob }>('/api/studios/video', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  editVideo: (formData: FormData) =>
    request<{ job: GenerationJob }>('/api/studios/video/edit', {
      method: 'POST',
      body: formData,
    }),

  composeLyrics: (payload: { topic: string; genre: string; mood: string }) =>
    request<{ lyrics: string }>('/api/studios/music/lyrics', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  generateMusic: (payload: {
    prompt: string;
    genre: string;
    mode: 'song' | 'instrumental' | 'background';
    lyrics?: string;
    fullLength: boolean;
    format: 'mp3' | 'wav';
  }) =>
    request<{ job: GenerationJob }>('/api/studios/music', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  generateVoice: (payload: {
    text: string;
    voiceName: string;
    style?: string;
    dualSpeaker?: boolean;
    secondSpeakerText?: string;
    secondVoiceName?: string;
    secondStyle?: string;
    format?: 'wav' | 'mp3';
  }) =>
    request<{ job: GenerationJob }>('/api/studios/voice', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  generateCaptions: (formData: FormData) =>
    request<{ job: GenerationJob }>('/api/studios/captions', {
      method: 'POST',
      body: formData,
    }),

  generateSocialPack: (payload: { topic: string; platform: string; aspectRatio: string; tone: string }) =>
    request<{ job: GenerationJob }>('/api/studios/social', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

export async function triggerFileDownload(fileUrl: string, fileName: string, format: string, jobId?: string) {
  try {
    await api.recordDownload({ jobId, fileName, fileUrl, format });
  } catch {
    // Non-blocking download history logging
  }
  const link = document.createElement('a');
  link.href = fileUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
