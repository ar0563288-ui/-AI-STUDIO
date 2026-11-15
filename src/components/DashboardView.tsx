import React, { useState } from 'react';
import {
  ArrowRight,
  Download,
  Film,
  FolderPlus,
  Image as ImageIcon,
  MessageSquare,
  Mic,
  Music,
  Plus,
  Trash2,
} from 'lucide-react';
import { api, triggerFileDownload } from '../lib/api';
import {
  DownloadItem,
  GenerationJob,
  ProjectItem,
  StudioRoute,
  UserProfile,
} from '../types/studio';

interface DashboardViewProps {
  user: UserProfile;
  projects: ProjectItem[];
  jobs: GenerationJob[];
  downloads: DownloadItem[];
  onNavigate: (route: StudioRoute) => void;
  onRefreshData: () => void;
}

const STUDIO_LAUNCHERS: Array<{
  route: StudioRoute;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    route: 'chat',
    title: 'AI Chat & Docs',
    subtitle: 'Multi-session reasoning & document analysis',
    icon: MessageSquare,
  },
  {
    route: 'image',
    title: 'Image Studio',
    subtitle: 'Generate, edit, and remove backgrounds',
    icon: ImageIcon,
  },
  {
    route: 'video',
    title: 'Video Studio',
    subtitle: '60s+ stitched MP4 films & subtitles',
    icon: Film,
  },
  {
    route: 'music',
    title: 'Music Studio',
    subtitle: 'Full songs, lyrics, vocals & MP3/WAV',
    icon: Music,
  },
  {
    route: 'voice_social',
    title: 'Voice & Social',
    subtitle: 'TTS voices, auto captions & social packs',
    icon: Mic,
  },
];

export function DashboardView({
  user,
  projects,
  jobs,
  downloads,
  onNavigate,
  onRefreshData,
}: DashboardViewProps) {
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectType, setNewProjectType] = useState<ProjectItem['type']>('video');
  const [creating, setCreating] = useState(false);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newProjectTitle.trim()) return;
    setCreating(true);
    try {
      await api.createProject({
        title: newProjectTitle.trim(),
        type: newProjectType,
        description: `Created in ${newProjectType} workspace`,
        thumbnailUrl: '/src/assets/images/showcase_cinematic_frame_1794729447424.jpg',
      });
      setNewProjectTitle('');
      onRefreshData();
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteProject(id: string) {
    await api.deleteProject(id);
    onRefreshData();
  }

  return (
    <div className="space-y-8">
      {/* Hero Banner with measured dark scrim */}
      <section className="relative overflow-hidden rounded-xl border border-violet-500/20 bg-[#0E0A18] min-h-[240px] flex items-end">
        {!heroImgFailed ? (
          <img
            src="/src/assets/images/studio_hero_backdrop_1794729447780.jpg"
            alt="AI STUDIO dark violet architectural backdrop"
            referrerPolicy="no-referrer"
            onError={() => setHeroImgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover opacity-75"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#1B1033] via-[#0B0814] to-[#07050C]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#07050C] via-[#07050C]/75 to-[#07050C]/25" />

        <div className="relative z-10 w-full p-6 sm:p-8 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-xs font-medium text-violet-300/90 mb-2">
              {user.fullName} · {user.planTier.toUpperCase()} Workspace
            </p>
            <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight text-white [text-wrap:balance]">
              Unified Multimodal Creation Studio
            </h1>
            <p className="text-sm sm:text-base text-violet-100/75 mt-2 max-w-xl">
              Produce 60-second stitched videos, high-resolution imagery, original vocal tracks, voiceovers, and social campaigns from one shared workspace.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('video')}
              className="px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm font-medium text-white transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <span>Create 60s Video</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('music')}
              className="px-4 py-2.5 rounded-lg bg-[#161026] hover:bg-[#1E1633] border border-violet-500/25 text-sm font-medium text-violet-100 transition-colors whitespace-nowrap shrink-0"
            >
              Compose Song
            </button>
          </div>
        </div>
      </section>

      {/* Credit Balance Breakdown Row */}
      <section aria-label="Credit Balances">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">Credit Allocation</h2>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="text-xs font-medium text-violet-300 hover:text-violet-200 transition-colors"
          >
            Manage Credits & Plans
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Chat Credits', value: user.credits.chat },
            { label: 'Image Credits', value: user.credits.image },
            { label: 'Video Credits', value: user.credits.video },
            { label: 'Music Credits', value: user.credits.music },
            { label: 'Voice Credits', value: user.credits.voice },
          ].map((stat) => (
            <div
              key={stat.label}
              className="p-4 rounded-xl bg-[#0E0A18] border border-violet-500/15"
            >
              <div className="text-xs text-violet-200/65">{stat.label}</div>
              <div className="text-2xl font-semibold font-mono tabular-nums text-white mt-1">
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Studio Quick Launchers */}
      <section>
        <h2 className="text-sm font-semibold text-white mb-3">Creative Studios</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {STUDIO_LAUNCHERS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.route}
                type="button"
                onClick={() => onNavigate(item.route)}
                className="p-4 rounded-xl bg-[#0E0A18] hover:bg-[#140F22] border border-violet-500/15 hover:border-violet-500/45 text-left transition-colors group"
              >
                <Icon className="w-5 h-5 text-violet-400 mb-3" />
                <div className="text-sm font-medium text-white group-hover:text-violet-200 transition-colors">
                  {item.title}
                </div>
                <div className="text-xs text-violet-200/60 mt-1 leading-relaxed">
                  {item.subtitle}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Projects & Recent Generations Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* My Projects */}
        <section className="lg:col-span-5 rounded-xl bg-[#0E0A18] border border-violet-500/15 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">My Projects</h2>
            <span className="text-xs font-mono tabular-nums text-violet-300/60">
              {projects.length} total
            </span>
          </div>

          <form onSubmit={handleCreateProject} className="flex gap-2 mb-4">
            <input
              type="text"
              value={newProjectTitle}
              onChange={(e) => setNewProjectTitle(e.target.value)}
              placeholder="New project name..."
              className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-[#08050F] border border-violet-500/20 text-xs text-white placeholder:text-violet-300/35 focus:border-violet-500 focus:outline-none"
            />
            <select
              value={newProjectType}
              onChange={(e) => setNewProjectType(e.target.value as ProjectItem['type'])}
              aria-label="Project Type"
              className="px-2.5 py-2 rounded-lg bg-[#08050F] border border-violet-500/20 text-xs text-violet-100 focus:border-violet-500 focus:outline-none"
            >
              <option value="video">Video</option>
              <option value="image">Image</option>
              <option value="music">Music</option>
              <option value="social">Social</option>
            </select>
            <button
              type="submit"
              disabled={creating || !newProjectTitle.trim()}
              className="px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-xs font-medium text-white inline-flex items-center gap-1 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </form>

          {projects.length === 0 ? (
            <div className="py-10 text-center text-xs text-violet-200/55">
              <FolderPlus className="w-6 h-6 mx-auto mb-2 text-violet-400/50" />
              Create a project folder to organize videos, tracks, and artwork.
            </div>
          ) : (
            <div className="divide-y divide-violet-500/10">
              {projects.slice(0, 6).map((proj) => (
                <div key={proj.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">{proj.title}</div>
                    <div className="text-xs text-violet-200/55 mt-0.5 truncate">
                      {proj.type} · {new Date(proj.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteProject(proj.id)}
                    aria-label={`Delete ${proj.title}`}
                    className="p-1.5 rounded-lg text-violet-300/45 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Generations */}
        <section className="lg:col-span-7 rounded-xl bg-[#0E0A18] border border-violet-500/15 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Recent Generations</h2>
            <span className="text-xs font-mono tabular-nums text-violet-300/60">
              {jobs.length} jobs
            </span>
          </div>

          {jobs.length === 0 ? (
            <div className="py-10 text-center text-xs text-violet-200/55">
              No generations yet. Launch Image, Video, Music, or Voice Studio to create your first asset.
            </div>
          ) : (
            <div className="divide-y divide-violet-500/10">
              {jobs.slice(0, 6).map((job) => (
                <div key={job.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white truncate">{job.prompt}</div>
                    <div className="text-xs text-violet-200/55 mt-0.5 flex items-center gap-2">
                      <span>{job.job_type.replace('_', ' ')}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          job.status === 'completed'
                            ? 'text-emerald-400'
                            : job.status === 'failed'
                              ? 'text-red-400'
                              : 'text-violet-300'
                        }
                      >
                        {job.status}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{job.credits_cost} cr</span>
                    </div>
                  </div>
                  {job.output_url && job.status === 'completed' && (
                    <button
                      type="button"
                      onClick={() =>
                        triggerFileDownload(
                          job.output_url!,
                          `${job.job_type}_${job.id.slice(0, 6)}`,
                          job.job_type,
                          job.id
                        )
                      }
                      className="px-3 py-1.5 rounded-lg bg-[#161026] hover:bg-violet-600/30 border border-violet-500/20 text-xs font-medium text-violet-100 inline-flex items-center gap-1.5 shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Save</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Download History */}
      <section className="rounded-xl bg-[#0E0A18] border border-violet-500/15 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Download History</h2>
          <span className="text-xs font-mono tabular-nums text-violet-300/60">
            {downloads.length} exports
          </span>
        </div>

        {downloads.length === 0 ? (
          <p className="text-xs text-violet-200/55 py-4">
            Exported images, MP4 videos, MP3/WAV tracks, and SRT captions will appear here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-violet-500/15 text-violet-200/60">
                  <th className="py-2 pr-4 font-medium">File</th>
                  <th className="py-2 pr-4 font-medium">Format</th>
                  <th className="py-2 pr-4 font-medium">Exported</th>
                  <th className="py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-500/10">
                {downloads.slice(0, 8).map((dl) => (
                  <tr key={dl.id} className="hover:bg-violet-500/5">
                    <td className="py-2.5 pr-4 text-white font-medium truncate max-w-[240px]">
                      {dl.file_name}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-violet-300/80 uppercase">
                      {dl.format}
                    </td>
                    <td className="py-2.5 pr-4 font-mono tabular-nums text-violet-200/55">
                      {new Date(dl.created_at).toLocaleString()}
                    </td>
                    <td className="py-2.5 text-right">
                      <a
                        href={dl.file_url}
                        download={dl.file_name}
                        className="text-violet-300 hover:text-white font-medium"
                      >
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
