import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function formatGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('API_KEY_INVALID') || raw.includes('400')) {
    return { status: 400, message: raw };
  }
  if (raw.includes('PERMISSION_DENIED') || raw.includes('403')) {
    return {
      status: 403,
      message: 'API key lacks permission for this model. Verify GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message: 'Quota exceeded or this model requires a billing-enabled API key in Settings > Secrets.',
    };
  }
  if (raw.includes('NOT_FOUND') || raw.includes('404')) {
    return { status: 404, message: `Requested AI model unavailable: ${raw}` };
  }
  return { status: 500, message: raw };
}

export const ALLOWED_CHAT_MODELS = [
  'gemini-4-hydrogen',
  'gemini-4-argon',
  'gemini-4-carbon',
  'gemini-3.1-flash-lite',
] as const;

export async function* streamChatResponse(params: {
  model: string;
  systemInstruction?: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  message: string;
  attachmentText?: string;
  attachmentInline?: { data: string; mimeType: string };
}) {
  const ai = getGeminiClient();
  const safeModel = (ALLOWED_CHAT_MODELS as readonly string[]).includes(params.model)
    ? params.model
    : 'gemini-4-hydrogen';

  const contextHistory = params.history
    .slice(-12)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  const promptText = [
    contextHistory ? `Previous conversation:\n${contextHistory}\n\n---\n` : '',
    params.attachmentText ? `Attached Document Context:\n${params.attachmentText}\n\n` : '',
    `User Request:\n${params.message}`,
  ]
    .filter(Boolean)
    .join('');

  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
  if (params.attachmentInline) {
    parts.push({ inlineData: params.attachmentInline });
  }
  parts.push({ text: promptText });

  const stream = await ai.models.generateContentStream({
    model: safeModel,
    contents: { parts },
    config: {
      systemInstruction:
        params.systemInstruction ||
        'You are AI STUDIO Assistant, a precise, helpful creative and technical partner.',
      ...(safeModel === 'gemini-4-hydrogen'
        ? { thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM } }
        : {}),
    },
  });

  for await (const chunk of stream) {
    if (chunk.text) {
      yield chunk.text;
    }
  }
}

export async function generateOrEditImage(params: {
  prompt: string;
  style?: string;
  aspectRatio?: string;
  resolution?: '1K' | '2K' | '4K';
  highQuality?: boolean;
  referenceImageBase64?: string;
  referenceMimeType?: string;
  mode?: 'generate' | 'edit' | 'bg_remove';
}): Promise<{ base64: string; mimeType: string; caption?: string }> {
  const ai = getGeminiClient();
  const usePro = Boolean(params.highQuality || (params.resolution && params.resolution !== '1K'));
  const model = usePro ? 'gemini-nano-banana-2.1' : 'gemini-3.1-flash-lite-image';

  // Supported native aspect ratios for Gemini image models
  const supportedRatios = ['1:1', '3:4', '4:3', '9:16', '16:9'];
  const requestedRatio = params.aspectRatio || '1:1';
  const mappedRatio = supportedRatios.includes(requestedRatio)
    ? requestedRatio
    : requestedRatio === '4:5'
      ? '3:4'
      : requestedRatio === '21:9'
        ? '16:9'
        : '1:1';

  let finalPrompt = params.prompt;
  if (params.mode === 'bg_remove') {
    finalPrompt =
      'Isolate the primary foreground subject cleanly and replace the entire background with a solid pure transparent-style studio white/neutral matte cutout backdrop, preserving crisp hair and edge details.';
  } else if (params.style && params.style !== 'none') {
    finalPrompt = `${params.prompt}. Visual style: ${params.style}.`;
  }

  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
  if (params.referenceImageBase64 && params.referenceMimeType) {
    parts.push({
      inlineData: {
        data: params.referenceImageBase64,
        mimeType: params.referenceMimeType,
      },
    });
  }
  parts.push({ text: finalPrompt });

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      imageConfig: {
        aspectRatio: mappedRatio,
        ...(usePro ? { imageSize: params.resolution || '1K' } : {}),
      },
    },
  });

  let base64 = '';
  let mimeType = 'image/png';
  let caption = '';

  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) {
      base64 = part.inlineData.data;
      mimeType = part.inlineData.mimeType ?? 'image/png';
    } else if (part.text) {
      caption += part.text;
    }
  }

  if (!base64) {
    throw new Error('Model returned no image output.');
  }

  return { base64, mimeType, caption: caption.trim() || undefined };
}

export interface VideoScenePlan {
  sceneNumber: number;
  durationSec: number;
  visualPrompt: string;
  subtitleText: string;
}

export async function planVideoScenes(params: {
  prompt: string;
  targetDurationSec: number;
  mode: 'text' | 'image' | 'script';
}): Promise<VideoScenePlan[]> {
  const ai = getGeminiClient();
  const clipDuration = 15;
  const clipCount = Math.max(1, Math.ceil(params.targetDurationSec / clipDuration));
  const perClipSec = Math.min(15, Math.max(5, Math.ceil(params.targetDurationSec / clipCount)));

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Create a ${clipCount}-scene continuous cinematic storyboard totaling ~${params.targetDurationSec} seconds based on this ${params.mode} input: "${params.prompt}". Each scene should flow visually from the previous scene and include concise subtitle narration.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            sceneNumber: { type: Type.INTEGER },
            durationSec: { type: Type.INTEGER },
            visualPrompt: { type: Type.STRING },
            subtitleText: { type: Type.STRING },
          },
          required: ['sceneNumber', 'durationSec', 'visualPrompt', 'subtitleText'],
        },
      },
    },
  });

  try {
    const parsed = JSON.parse(response.text || '[]') as VideoScenePlan[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.slice(0, clipCount).map((s, idx) => ({
        sceneNumber: idx + 1,
        durationSec: Math.min(15, Math.max(5, s.durationSec || perClipSec)),
        visualPrompt: s.visualPrompt || params.prompt,
        subtitleText: s.subtitleText || '',
      }));
    }
  } catch {
    // Fallback deterministic breakdown if JSON parse fails
  }

  return Array.from({ length: clipCount }, (_, idx) => ({
    sceneNumber: idx + 1,
    durationSec: perClipSec,
    visualPrompt: `${params.prompt} — Scene ${idx + 1} of ${clipCount}, continuous camera motion.`,
    subtitleText: '',
  }));
}

export async function generateVideoClip(params: {
  prompt: string;
  aspectRatio: '16:9' | '9:16';
  durationSec: number;
  resolution: '360p' | '720p' | '1080p' | '4k';
  previousInteractionId?: string;
  imageBase64?: string;
  imageMimeType?: string;
}): Promise<{ buffer: Buffer; interactionId?: string }> {
  const ai = getGeminiClient();
  const clampedDur = Math.min(15, Math.max(3, Math.round(params.durationSec)));

  let input: unknown = params.prompt;
  if (params.imageBase64 && params.imageMimeType) {
    input = [
      {
        type: 'image',
        mime_type: params.imageMimeType,
        data: params.imageBase64,
      },
      {
        type: 'text',
        text: params.prompt,
      },
    ];
  }

  const interaction = (await ai.interactions.create(
    {
      model: 'gemini-omni-1.2-flash',
      input: input as string,
      ...(params.previousInteractionId
        ? { previous_interaction_id: params.previousInteractionId }
        : {}),
      background: false,
      store: true,
      stream: false,
      response_format: {
        type: 'video',
        aspect_ratio: params.aspectRatio,
        duration: `${clampedDur}s`,
        resolution: params.resolution,
      },
    } as Parameters<typeof ai.interactions.create>[0],
    { timeout: 300000 }
  )) as { id?: string; output_video?: { data?: string; mime_type?: string } | null };

  const videoPart = interaction.output_video;
  if (!videoPart || !videoPart.data) {
    throw new Error('Video provider returned no video binary data.');
  }

  return {
    buffer: Buffer.from(videoPart.data, 'base64'),
    interactionId: interaction.id,
  };
}

export async function generateLyricsText(params: {
  topic: string;
  genre: string;
  mood: string;
}): Promise<string> {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Write original song lyrics for a ${params.genre} track with a ${params.mood} mood about: ${params.topic}. Include [Verse 1], [Chorus], [Verse 2], [Bridge], and [Outro] sections.`,
  });
  return response.text || '';
}

export async function generateMusicAudio(params: {
  prompt: string;
  genre: string;
  mode: 'song' | 'instrumental' | 'background';
  lyrics?: string;
  fullLength: boolean;
  referenceImageBase64?: string;
  referenceImageMimeType?: string;
}): Promise<{ buffer: Buffer; mimeType: string; generatedLyrics: string }> {
  const ai = getGeminiClient();
  const model = params.fullLength ? 'lyria-3-pro-preview' : 'lyria-3-clip-preview';

  const modeDirective =
    params.mode === 'instrumental'
      ? 'Pure instrumental arrangement with zero vocals.'
      : params.mode === 'background'
        ? 'Smooth ambient background score suitable for video narration, no lead vocals.'
        : 'Full original song with expressive lead vocals and rich production.';

  const fullPrompt = [
    `Genre: ${params.genre}.`,
    modeDirective,
    params.prompt,
    params.lyrics && params.mode === 'song' ? `Sing these lyrics:\n${params.lyrics}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const contents =
    params.referenceImageBase64 && params.referenceImageMimeType
      ? {
          parts: [
            { text: fullPrompt },
            {
              inlineData: {
                data: params.referenceImageBase64,
                mimeType: params.referenceImageMimeType,
              },
            },
          ],
        }
      : fullPrompt;

  const responseStream = await ai.models.generateContentStream({
    model,
    contents,
  });

  const audioChunks: Buffer[] = [];
  let generatedLyrics = '';
  let mimeType = 'audio/mpeg';

  for await (const chunk of responseStream) {
    const parts = chunk.candidates?.[0]?.content?.parts;
    if (!parts) continue;
    for (const part of parts) {
      if (part.inlineData?.data) {
        if (audioChunks.length === 0 && part.inlineData.mimeType) {
          mimeType = part.inlineData.mimeType;
        }
        audioChunks.push(Buffer.from(part.inlineData.data, 'base64'));
      }
      if (part.text) {
        generatedLyrics += part.text;
      }
    }
  }

  if (audioChunks.length === 0) {
    throw new Error('Music generation model returned no audio stream.');
  }

  return {
    buffer: Buffer.concat(audioChunks),
    mimeType,
    generatedLyrics: generatedLyrics.trim(),
  };
}

export async function generateSpeechAudio(params: {
  text: string;
  voiceName: string;
  style?: string;
  dualSpeaker?: boolean;
  secondSpeakerText?: string;
  secondVoiceName?: string;
  secondStyle?: string;
}): Promise<Buffer> {
  const ai = getGeminiClient();

  if (params.dualSpeaker && params.secondSpeakerText) {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Speaker A: ${params.text}`,
              speechMetadata: {
                speaker: 'Speaker A',
                style: params.style || 'Clear, expressive host',
              },
            },
            {
              text: `Speaker B: ${params.secondSpeakerText}`,
              speechMetadata: {
                speaker: 'Speaker B',
                style: params.secondStyle || 'Articulate co-host',
              },
            },
          ] as unknown as Array<{ text: string }>,
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              {
                speaker: 'Speaker A',
                voiceConfig: { prebuiltVoiceConfig: { voiceName: params.voiceName || 'Puck' } },
              },
              {
                speaker: 'Speaker B',
                voiceConfig: { prebuiltVoiceConfig: { voiceName: params.secondVoiceName || 'Kore' } },
              },
            ],
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error('TTS returned no audio data.');
    return Buffer.from(base64Audio, 'base64');
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash-lite-tts',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: params.text,
            ...(params.style ? { speechMetadata: { style: params.style } } : {}),
          },
        ] as unknown as Array<{ text: string }>,
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: params.voiceName || 'Kore' },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error('TTS returned no audio data.');
  return Buffer.from(base64Audio, 'base64');
}

export async function transcribeAndGenerateSrt(params: {
  audioBase64: string;
  mimeType: string;
}): Promise<{ transcript: string; srt: string }> {
  const ai = getGeminiClient();

  const transcriptRes = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: {
      parts: [
        { inlineData: { mimeType: params.mimeType, data: params.audioBase64 } },
        { text: 'Transcribe this audio accurately with punctuation and speaker cues if present.' },
      ],
    },
  });

  const transcript = (transcriptRes.text || '').trim();

  const srtRes = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Convert this transcript into clean timed SubRip (.srt) caption blocks (max 8 words per caption cue, starting at 00:00:00,000). Return ONLY the valid .srt text.\n\nTranscript:\n${transcript}`,
  });

  return {
    transcript,
    srt: (srtRes.text || '').replace(/```srt\s*|```/g, '').trim(),
  };
}

export async function generateSocialMediaPack(params: {
  topic: string;
  platform: string;
  aspectRatio: string;
  tone: string;
}) {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Generate a complete social media production pack for ${params.platform} (${params.aspectRatio} format) with a ${params.tone} tone about: ${params.topic}.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          hook: { type: Type.STRING },
          script: { type: Type.STRING },
          caption: { type: Type.STRING },
          hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
          shotList: { type: Type.ARRAY, items: { type: Type.STRING } },
          videoPrompt: { type: Type.STRING },
        },
        required: ['title', 'hook', 'script', 'caption', 'hashtags', 'shotList', 'videoPrompt'],
      },
    },
  });

  return JSON.parse(response.text || '{}');
}

export function buildSrtFromScenes(scenes: VideoScenePlan[]): string {
  let cursor = 0;
  const blocks: string[] = [];

  const fmt = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = Math.floor(sec % 60);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},000`;
  };

  scenes.forEach((scene, idx) => {
    const start = cursor;
    const end = cursor + scene.durationSec;
    cursor = end;
    if (scene.subtitleText.trim()) {
      blocks.push(`${idx + 1}\n${fmt(start)} --> ${fmt(end)}\n${scene.subtitleText.trim()}`);
    }
  });

  return blocks.join('\n\n');
}
