export type StudioRoute =
  | 'dashboard'
  | 'chat'
  | 'image'
  | 'video'
  | 'music'
  | 'voice_social'
  | 'projects'
  | 'settings';

export interface CreditBreakdown {
  chat: number;
  image: number;
  video: number;
  music: number;
  voice: number;
  total: number;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string;
  planTier: 'free' | 'pro' | 'studio';
  credits: CreditBreakdown;
  createdAt: string;
  updatedAt: string;
}

export interface ChatThread {
  id: string;
  user_id: string;
  title: string;
  model: string;
  system_prompt: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments_json: string;
  tokens_used: number;
  created_at: string;
}

export interface ProjectItem {
  id: string;
  user_id: string;
  title: string;
  type: 'chat' | 'image' | 'video' | 'music' | 'voice' | 'social';
  description: string;
  thumbnail_url: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

export interface GenerationJob {
  id: string;
  user_id: string;
  project_id: string | null;
  job_type: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  step_label: string;
  prompt: string;
  params_json: string;
  output_url: string | null;
  output_meta_json: string;
  credits_cost: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface DownloadItem {
  id: string;
  user_id: string;
  job_id: string | null;
  file_name: string;
  file_url: string;
  format: string;
  created_at: string;
}

export interface CreditTransaction {
  id: string;
  user_id: string;
  category: string;
  amount: number;
  balance_after: number;
  description: string;
  created_at: string;
}

export interface AspectPreset {
  id: string;
  label: string;
  platform: string;
  ratio: string;
}

export const SOCIAL_ASPECT_RATIOS: AspectPreset[] = [
  { id: 'tiktok', label: 'TikTok', platform: 'Vertical', ratio: '9:16' },
  { id: 'yt_shorts', label: 'YT Shorts', platform: 'Vertical', ratio: '9:16' },
  { id: 'yt_landscape', label: 'YouTube', platform: 'Landscape', ratio: '16:9' },
  { id: 'ig_square', label: 'IG Square', platform: 'Square', ratio: '1:1' },
  { id: 'ig_portrait', label: 'IG Portrait', platform: 'Portrait', ratio: '4:5' },
  { id: 'ig_reels', label: 'IG Reels', platform: 'Vertical', ratio: '9:16' },
  { id: 'cinematic', label: 'Cinematic', platform: 'Ultrawide', ratio: '21:9' },
  { id: 'custom', label: 'Custom', platform: 'Manual', ratio: 'custom' },
];
