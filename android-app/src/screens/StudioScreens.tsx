import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Audio, ResizeMode, Video } from 'expo-av';
import { mobileApi, MobileJob, resolveMediaUrl } from '../api/client';
import { useAuth } from '../context/AuthContext';

const RATIOS = [
  { label: 'TikTok 9:16', value: '9:16' },
  { label: 'YouTube 16:9', value: '16:9' },
  { label: 'IG Square 1:1', value: '1:1' },
  { label: 'IG Portrait 4:5', value: '4:5' },
  { label: 'Cinematic 21:9', value: '21:9' },
];

export function AuthScreen() {
  const { signIn, signUp, signInDemo } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setError(null);
    setBusy(true);
    try {
      if (isRegister) {
        await signUp(email, password, fullName);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.authContainer}>
      <Text style={styles.brand}>AI STUDIO</Text>
      <Text style={styles.subtitle}>Unified Mobile & Web Multimodal Workspace</Text>

      <View style={styles.card}>
        {isRegister && (
          <TextInput
            style={styles.input}
            placeholder="Full Name"
            placeholderTextColor="#7E749E"
            value={fullName}
            onChangeText={setFullName}
          />
        )}
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#7E749E"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#7E749E"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity style={styles.primaryBtn} onPress={handleSubmit} disabled={busy}>
          <Text style={styles.primaryBtnText}>
            {busy ? 'Please wait...' : isRegister ? 'Create Free Account' : 'Sign In'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => signInDemo()}
          disabled={busy}
        >
          <Text style={styles.secondaryBtnText}>Enter Demo Creator Account</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsRegister((v) => !v)}>
          <Text style={styles.linkText}>
            {isRegister ? 'Already have an account? Sign In' : 'New to AI STUDIO? Create Account'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

export function DashboardScreen({ onOpenTab }: { onOpenTab: (tab: string) => void }) {
  const { user, signOut } = useAuth();
  const [jobs, setJobs] = useState<MobileJob[]>([]);

  useEffect(() => {
    mobileApi.listJobs().then((res) => setJobs(res.jobs)).catch(() => {});
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.screenPad}>
      <View style={styles.rowBetween}>
        <View>
          <Text style={styles.heading}>Welcome, {user?.fullName}</Text>
          <Text style={styles.muted}>
            {user?.credits.total ?? 0} total credits · {user?.planTier.toUpperCase()}
          </Text>
        </View>
        <TouchableOpacity style={styles.smallBtn} onPress={signOut}>
          <Text style={styles.smallBtnText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.creditGrid}>
        {[
          { label: 'Chat', val: user?.credits.chat ?? 0 },
          { label: 'Image', val: user?.credits.image ?? 0 },
          { label: 'Video', val: user?.credits.video ?? 0 },
          { label: 'Music', val: user?.credits.music ?? 0 },
        ].map((item) => (
          <View key={item.label} style={styles.creditCard}>
            <Text style={styles.muted}>{item.label}</Text>
            <Text style={styles.creditNum}>{item.val}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Launch Studio</Text>
      <View style={styles.studioGrid}>
        {[
          { id: 'chat', title: 'AI Chat' },
          { id: 'image', title: 'Image Studio' },
          { id: 'video', title: '60s Video' },
          { id: 'music', title: 'Music & Voice' },
        ].map((st) => (
          <TouchableOpacity key={st.id} style={styles.studioTile} onPress={() => onOpenTab(st.id)}>
            <Text style={styles.studioTileText}>{st.title}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Synced Project Generations</Text>
      {jobs.slice(0, 6).map((j) => (
        <View key={j.id} style={styles.listItem}>
          <Text style={styles.listTitle} numberOfLines={1}>
            {j.prompt}
          </Text>
          <Text style={styles.muted}>
            {j.job_type} · {j.status}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

export function ChatScreen() {
  const { refreshUser } = useAuth();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ id: string; role: string; content: string }>>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    mobileApi.listThreads().then(async (res) => {
      if (res.threads.length > 0) {
        setThreadId(res.threads[0].id);
        const msgRes = await mobileApi.listMessages(res.threads[0].id);
        setMessages(msgRes.messages);
      } else {
        const created = await mobileApi.createThread('Mobile Session');
        setThreadId(created.thread.id);
      }
    });
  }, []);

  async function send() {
    if (!text.trim() || !threadId || sending) return;
    const prompt = text.trim();
    setText('');
    setMessages((prev) => [...prev, { id: String(Date.now()), role: 'user', content: prompt }]);
    setSending(true);
    try {
      const reply = await mobileApi.sendChat(threadId, prompt);
      setMessages((prev) => [...prev, { id: String(Date.now() + 1), role: 'assistant', content: reply }]);
      await refreshUser();
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.flexCol}>
      <ScrollView contentContainerStyle={styles.screenPad}>
        {messages.map((m) => (
          <View key={m.id} style={[styles.msgBubble, m.role === 'user' ? styles.userBubble : styles.botBubble]}>
            <Text style={styles.msgText}>{m.content}</Text>
          </View>
        ))}
        {sending && <ActivityIndicator color="#8B5CF6" />}
      </ScrollView>
      <View style={styles.chatComposer}>
        <TextInput
          style={[styles.input, { flex: 1, marginBottom: 0 }]}
          placeholder="Message AI STUDIO..."
          placeholderTextColor="#7E749E"
          value={text}
          onChangeText={setText}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={send}>
          <Text style={styles.primaryBtnText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function ImageStudioScreen() {
  const { refreshUser } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [ratio, setRatio] = useState('1:1');
  const [job, setJob] = useState<MobileJob | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      const res = await mobileApi.generateImage(prompt, ratio);
      setJob(res.job);
      await refreshUser();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screenPad}>
      <Text style={styles.heading}>AI Image Studio</Text>
      <TextInput
        style={[styles.input, { minHeight: 80 }]}
        multiline
        placeholder="Describe your artwork..."
        placeholderTextColor="#7E749E"
        value={prompt}
        onChangeText={setPrompt}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        {RATIOS.map((r) => (
          <TouchableOpacity
            key={r.label}
            onPress={() => setRatio(r.value)}
            style={[styles.ratioBtn, ratio === r.value && styles.ratioBtnActive]}
          >
            <Text style={styles.smallBtnText}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <TouchableOpacity style={styles.primaryBtn} onPress={generate} disabled={busy}>
        <Text style={styles.primaryBtnText}>{busy ? 'Generating...' : 'Generate Image'}</Text>
      </TouchableOpacity>

      {job?.output_url && (
        <Image
          source={{ uri: resolveMediaUrl(job.output_url) }}
          style={styles.previewImage}
          resizeMode="contain"
        />
      )}
    </ScrollView>
  );
}

export function VideoStudioScreen() {
  const { refreshUser } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [ratio, setRatio] = useState('9:16');
  const [duration, setDuration] = useState(60);
  const [job, setJob] = useState<MobileJob | null>(null);

  async function generate() {
    if (!prompt.trim()) return;
    const res = await mobileApi.generateVideo(prompt, ratio, duration);
    setJob(res.job);
    const poll = setInterval(async () => {
      const latest = await mobileApi.getJob(res.job.id);
      setJob(latest.job);
      if (latest.job.status !== 'processing') {
        clearInterval(poll);
        await refreshUser();
      }
    }, 3000);
  }

  return (
    <ScrollView contentContainerStyle={styles.screenPad}>
      <Text style={styles.heading}>AI Video Studio (60s+)</Text>
      <TextInput
        style={[styles.input, { minHeight: 90 }]}
        multiline
        placeholder="Describe your 60s video or paste a script..."
        placeholderTextColor="#7E749E"
        value={prompt}
        onChangeText={setPrompt}
      />
      <View style={styles.rowBetween}>
        {[15, 60, 75].map((sec) => (
          <TouchableOpacity
            key={sec}
            onPress={() => setDuration(sec)}
            style={[styles.ratioBtn, duration === sec && styles.ratioBtnActive]}
          >
            <Text style={styles.smallBtnText}>{sec}s</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 12 }}>
        {RATIOS.map((r) => (
          <TouchableOpacity
            key={r.label}
            onPress={() => setRatio(r.value)}
            style={[styles.ratioBtn, ratio === r.value && styles.ratioBtnActive]}
          >
            <Text style={styles.smallBtnText}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <TouchableOpacity style={styles.primaryBtn} onPress={generate}>
        <Text style={styles.primaryBtnText}>Generate {duration}s Video</Text>
      </TouchableOpacity>

      {job?.status === 'processing' && (
        <View style={styles.card}>
          <Text style={styles.listTitle}>{job.step_label}</Text>
          <Text style={styles.muted}>{job.progress}% complete</Text>
        </View>
      )}
      {job?.output_url && job.status === 'completed' && (
        <Video
          source={{ uri: resolveMediaUrl(job.output_url) }}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
          style={styles.videoPlayer}
        />
      )}
    </ScrollView>
  );
}

export function MusicVoiceScreen() {
  const { refreshUser } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generateSong() {
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      const res = await mobileApi.generateMusic(prompt, 'Synthwave', true);
      if (res.job.output_url) {
        setAudioUrl(resolveMediaUrl(res.job.output_url));
      }
      await refreshUser();
    } finally {
      setBusy(false);
    }
  }

  async function playAudio() {
    if (!audioUrl) return;
    const { sound } = await Audio.Sound.createAsync({ uri: audioUrl });
    await sound.playAsync();
  }

  return (
    <ScrollView contentContainerStyle={styles.screenPad}>
      <Text style={styles.heading}>AI Music & Voice Studio</Text>
      <TextInput
        style={[styles.input, { minHeight: 80 }]}
        multiline
        placeholder="Describe your song, genre, or mood..."
        placeholderTextColor="#7E749E"
        value={prompt}
        onChangeText={setPrompt}
      />
      <TouchableOpacity style={styles.primaryBtn} onPress={generateSong} disabled={busy}>
        <Text style={styles.primaryBtnText}>{busy ? 'Composing...' : 'Compose Original Song (MP3)'}</Text>
      </TouchableOpacity>

      {audioUrl && (
        <TouchableOpacity style={[styles.secondaryBtn, { marginTop: 16 }]} onPress={playAudio}>
          <Text style={styles.secondaryBtnText}>Play Generated Track</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  authContainer: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: '#07050C' },
  screenPad: { padding: 16, paddingBottom: 40 },
  flexCol: { flex: 1 },
  brand: { fontSize: 28, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#A59EC0', textAlign: 'center', marginTop: 6, marginBottom: 24 },
  heading: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#E2DCF5', marginTop: 20, marginBottom: 10 },
  muted: { fontSize: 12, color: '#9D93BD' },
  card: { backgroundColor: '#0E0A18', borderWidth: 1, borderColor: '#2A1F47', borderRadius: 14, padding: 16, marginTop: 12 },
  input: {
    backgroundColor: '#08050F',
    borderWidth: 1,
    borderColor: '#2A1F47',
    borderRadius: 10,
    color: '#FFFFFF',
    padding: 12,
    marginBottom: 12,
    fontSize: 14,
  },
  primaryBtn: { backgroundColor: '#7C3AED', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  secondaryBtn: {
    backgroundColor: '#161026',
    borderWidth: 1,
    borderColor: '#3B2D63',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryBtnText: { color: '#E2DCF5', fontWeight: '600', fontSize: 13 },
  linkText: { color: '#A78BFA', fontSize: 12, textAlign: 'center', marginTop: 14 },
  errorText: { color: '#FCA5A5', fontSize: 12, marginBottom: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  smallBtn: { backgroundColor: '#161026', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  smallBtnText: { color: '#E2DCF5', fontSize: 12, fontWeight: '600' },
  creditGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  creditCard: {
    width: '48%',
    backgroundColor: '#0E0A18',
    borderWidth: 1,
    borderColor: '#241A3D',
    borderRadius: 12,
    padding: 12,
  },
  creditNum: { fontSize: 22, fontWeight: '700', color: '#FFFFFF', marginTop: 4 },
  studioGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  studioTile: {
    width: '48%',
    backgroundColor: '#151026',
    borderWidth: 1,
    borderColor: '#3B2D63',
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
  },
  studioTileText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  listItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1B1430' },
  listTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '500' },
  msgBubble: { padding: 12, borderRadius: 12, marginBottom: 10, maxWidth: '85%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#4C1D95' },
  botBubble: { alignSelf: 'flex-start', backgroundColor: '#140F22', borderWidth: 1, borderColor: '#2A1F47' },
  msgText: { color: '#F4F2FA', fontSize: 14, lineHeight: 20 },
  chatComposer: { flexDirection: 'row', padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: '#241A3D' },
  sendBtn: { backgroundColor: '#7C3AED', paddingHorizontal: 16, borderRadius: 10, justifyContent: 'center' },
  ratioBtn: {
    backgroundColor: '#120D1E',
    borderWidth: 1,
    borderColor: '#2A1F47',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
  },
  ratioBtnActive: { borderColor: '#8B5CF6', backgroundColor: '#2E1065' },
  previewImage: { width: '100%', height: 320, borderRadius: 12, marginTop: 16, backgroundColor: '#0E0A18' },
  videoPlayer: { width: '100%', height: 280, borderRadius: 12, marginTop: 16, backgroundColor: '#000000' },
});
