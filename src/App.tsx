import React, { useEffect, useState } from 'react';
import {
  Film,
  FolderKanban,
  Image as ImageIcon,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Mic,
  Music,
  Settings,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { AccountSettingsView } from './components/AccountSettingsView';
import { AuthModal } from './components/AuthModal';
import { ChatView } from './components/ChatView';
import { DashboardView } from './components/DashboardView';
import { ImageStudioView } from './components/ImageStudioView';
import { MusicStudioView } from './components/MusicStudioView';
import { VideoStudioView } from './components/VideoStudioView';
import { VoiceSocialView } from './components/VoiceSocialView';
import { api, getStoredToken, setStoredToken } from './lib/api';
import {
  CreditTransaction,
  DownloadItem,
  GenerationJob,
  ProjectItem,
  StudioRoute,
  UserProfile,
} from './types/studio';

const NAV_ITEMS: Array<{
  id: StudioRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'chat', label: 'AI Chat', icon: MessageSquare },
  { id: 'image', label: 'Image Studio', icon: ImageIcon },
  { id: 'video', label: 'Video Studio', icon: Film },
  { id: 'music', label: 'Music Studio', icon: Music },
  { id: 'voice_social', label: 'Voice & Social', icon: Mic },
  { id: 'settings', label: 'Credits & Account', icon: Settings },
];

export default function App() {
  const [route, setRoute] = useState<StudioRoute>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [user, setUser] = useState<UserProfile | null>(null);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [videoInitialPrompt, setVideoInitialPrompt] = useState<string | undefined>(undefined);
  const [bootError, setBootError] = useState<string | null>(null);

  async function refreshWorkspaceData() {
    try {
      const [meRes, projRes, jobsRes, dlRes, txRes] = await Promise.all([
        api.me(),
        api.listProjects(),
        api.listJobs(),
        api.listDownloads(),
        api.listCreditHistory(),
      ]);
      setUser(meRes.user);
      setProjects(projRes.projects);
      setJobs(jobsRes.jobs);
      setDownloads(dlRes.downloads);
      setTransactions(txRes.transactions);
    } catch (err) {
      setBootError(err instanceof Error ? err.message : 'Unable to sync workspace');
    }
  }

  useEffect(() => {
    async function initSession() {
      try {
        if (!getStoredToken()) {
          const demo = await api.demoLogin();
          setStoredToken(demo.token);
        }
        await refreshWorkspaceData();
      } catch {
        try {
          const demo = await api.demoLogin();
          setStoredToken(demo.token);
          await refreshWorkspaceData();
        } catch (err) {
          setBootError(err instanceof Error ? err.message : 'Failed to initialize session');
        }
      }
    }
    initSession();
  }, []);

  function handleLogout() {
    setStoredToken(null);
    setUser(null);
    setAuthModalOpen(true);
  }

  const activeNav = NAV_ITEMS.find((n) => n.id === route) ?? NAV_ITEMS[0];
  const recentImages = jobs.filter((j) => ['image', 'image_edit', 'bg_remove'].includes(j.job_type));
  const recentVideos = jobs.filter((j) => ['video', 'video_edit'].includes(j.job_type));
  const recentMusic = jobs.filter((j) => j.job_type === 'music');
  const recentAudio = jobs.filter((j) => ['music', 'voice'].includes(j.job_type));

  return (
    <div className="min-h-screen bg-[#07050C] text-[#F4F2FA] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-[#0A0712] border-r border-violet-500/15">
        <div className="h-16 px-6 flex items-center border-b border-violet-500/15">
          <button
            type="button"
            onClick={() => setRoute('dashboard')}
            className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            AI STUDIO
          </button>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto" aria-label="Studio Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = route === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setRoute(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-violet-600/20 text-white border border-violet-500/40'
                    : 'text-violet-200/70 hover:text-white hover:bg-violet-500/10 border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-violet-400' : 'text-violet-300/60'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {user && (
          <div className="p-4 border-t border-violet-500/15 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-violet-200/60">Available Credits</span>
              <span className="font-mono tabular-nums font-semibold text-violet-300">
                {user.credits.total}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setRoute('settings')}
              className="w-full flex items-center gap-2.5 p-2 rounded-lg bg-[#110C1D] hover:bg-[#171127] border border-violet-500/15 text-left transition-colors"
            >
              <img
                src={user.avatarUrl}
                alt={user.fullName}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-lg object-cover shrink-0 bg-[#1B132C]"
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-white truncate">{user.fullName}</div>
                <div className="text-[11px] text-violet-300/60 truncate">{user.email}</div>
              </div>
            </button>
          </div>
        )}
      </aside>

      {/* Mobile Drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] bg-[#0A0712] border-r border-violet-500/20 flex flex-col h-full z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-violet-500/15">
              <span className="font-display text-lg font-bold tracking-tight text-white">AI STUDIO</span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close navigation"
                className="p-2 rounded-lg text-violet-200/70 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = route === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setRoute(item.id);
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-violet-600/20 text-white border border-violet-500/40'
                        : 'text-violet-200/70 hover:text-white hover:bg-violet-500/10'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb — Credits — Primary Account CTA */}
        <header className="h-16 px-4 sm:px-6 lg:px-8 border-b border-violet-500/15 bg-[#07050C]/90 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
              className="lg:hidden p-2 rounded-lg bg-[#110C1D] border border-violet-500/20 text-violet-100"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="lg:hidden font-display font-bold text-white whitespace-nowrap shrink-0">
                AI STUDIO
              </span>
              <span className="lg:hidden text-violet-400/50">/</span>
              <span className="font-medium text-white truncate">{activeNav.label}</span>
            </div>
          </div>

          <div className="flex items-center gap-6 shrink-0">
            {user && (
              <div className="hidden sm:flex items-center gap-2 text-xs text-violet-200/75 font-mono tabular-nums whitespace-nowrap">
                <span>{user.credits.total} credits</span>
                <span aria-hidden="true">·</span>
                <span className="uppercase">{user.planTier}</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0"
            >
              {user ? 'Account' : 'Sign In'}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          {bootError && (
            <div className="mb-5 p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-200">
              {bootError}
            </div>
          )}

          {!user ? (
            <div className="py-24 text-center space-y-4">
              <FolderKanban className="w-8 h-8 text-violet-400/60 mx-auto" />
              <div className="text-sm text-violet-200/70">Initializing AI STUDIO workspace...</div>
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="px-4 py-2 rounded-lg bg-violet-600 text-xs font-medium text-white"
              >
                Sign In or Create Free Account
              </button>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={route}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                {route === 'dashboard' && (
                  <DashboardView
                    user={user}
                    projects={projects}
                    jobs={jobs}
                    downloads={downloads}
                    onNavigate={setRoute}
                    onRefreshData={refreshWorkspaceData}
                  />
                )}
                {route === 'chat' && <ChatView onCreditChange={refreshWorkspaceData} />}
                {route === 'image' && (
                  <ImageStudioView
                    recentImages={recentImages}
                    onCompleted={refreshWorkspaceData}
                  />
                )}
                {route === 'video' && (
                  <VideoStudioView
                    recentVideos={recentVideos}
                    recentAudio={recentAudio}
                    initialPrompt={videoInitialPrompt}
                    onCompleted={refreshWorkspaceData}
                  />
                )}
                {route === 'music' && (
                  <MusicStudioView
                    recentMusic={recentMusic}
                    onCompleted={refreshWorkspaceData}
                  />
                )}
                {route === 'voice_social' && (
                  <VoiceSocialView
                    onSendScriptToVideo={(scriptText) => {
                      setVideoInitialPrompt(scriptText);
                      setRoute('video');
                    }}
                    onCompleted={refreshWorkspaceData}
                  />
                )}
                {route === 'settings' && (
                  <AccountSettingsView
                    user={user}
                    transactions={transactions}
                    onUserUpdated={setUser}
                    onOpenAuth={() => setAuthModalOpen(true)}
                    onLogout={handleLogout}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={(authedUser) => {
          setUser(authedUser);
          refreshWorkspaceData();
        }}
      />
    </div>
  );
}
