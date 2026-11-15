import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000';
const TOKEN_KEY = 'aistudio_android_jwt';

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string | null): Promise<void> {
  if (token) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
}

export function resolveMediaUrl(relativePath: string): string {
  if (!relativePath) return '';
  if (relativePath.startsWith('http')) return relativePath;
  return `${API_BASE}${relativePath}`;
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export interface MobileUser {
  id: string;
  email: string;
  fullName: string;
  planTier: string;
  credits: {
    chat: number;
    image: number;
    video: number;
    music: number;
    voice: number;
    total: number;
  };
}

export interface MobileJob {
  id: string;
  job_type: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  step_label: string;
  prompt: string;
  output_url: string | null;
  error_message: string | null;
  created_at: string;
}

export const mobileApi = {
  demoLogin: () => apiRequest<{ token: string; user: MobileUser }>('/api/auth/demo', { method: 'POST' }),
  login: (email: string, password: string) =>
    apiRequest<{ token: string; user: MobileUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string, fullName: string) =>
    apiRequest<{ token: string; user: MobileUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName }),
    }),
  me: () => apiRequest<{ user: MobileUser }>('/api/auth/me'),
  listJobs: () => apiRequest<{ jobs: MobileJob[] }>('/api/studios/jobs'),
  getJob: (id: string) => apiRequest<{ job: MobileJob }>(`/api/studios/jobs/${id}`),

  // Chat
  listThreads: () => apiRequest<{ threads: Array<{ id: string; title: string; model: string }> }>('/api/chat/threads'),
  createThread: (title: string) =>
    apiRequest<{ thread: { id: string; title: string } }>('/api/chat/threads', {
      method: 'POST',
      body: JSON.stringify({ title, model: 'gemini-4-hydrogen' }),
    }),
  listMessages: (threadId: string) =>
    apiRequest<{ messages: Array<{ id: string; role: string; content: string }> }>(
      `/api/chat/threads/${threadId}/messages`
    ),
  async sendChat(threadId: string, content: string): Promise<string> {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/api/chat/threads/${threadId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ content, model: 'gemini-4-hydrogen' }),
    });
    const raw = await res.text();
    let assembled = '';
    for (const block of raw.split('\n\n')) {
      if (!block.startsWith('data: ')) continue;
      const evt = JSON.parse(block.slice(6));
      if (evt.type === 'delta' && evt.text) assembled += evt.text;
      if (evt.type === 'error') throw new Error(evt.error);
    }
    return assembled;
  },

  // Studios
  generateImage: (prompt: string, aspectRatio: string) =>
    apiRequest<{ job: MobileJob }>('/api/studios/image', {
      method: 'POST',
      body: JSON.stringify({ prompt, aspectRatio, style: 'Photorealistic 8K Studio', resolution: '1K' }),
    }),
  generateVideo: (prompt: string, aspectRatio: string, targetDurationSec: number) =>
    apiRequest<{ job: MobileJob }>('/api/studios/video', {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        mode: 'text',
        aspectRatio,
        targetDurationSec,
        resolution: '720p',
        quality: 'high',
        includeSubtitles: true,
      }),
    }),
  generateMusic: (prompt: string, genre: string, fullLength: boolean) =>
    apiRequest<{ job: MobileJob }>('/api/studios/music', {
      method: 'POST',
      body: JSON.stringify({ prompt, genre, mode: 'song', fullLength, format: 'mp3' }),
    }),
  generateVoice: (text: string, voiceName: string) =>
    apiRequest<{ job: MobileJob }>('/api/studios/voice', {
      method: 'POST',
      body: JSON.stringify({ text, voiceName, format: 'mp3' }),
    }),
};
