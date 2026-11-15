# AI STUDIO — Multimodal Creation Platform

AI STUDIO is a unified full-stack AI creation platform with a responsive web workspace and a native React Native (Expo) Android application backed by one shared Node.js/Express API, relational database, and FFmpeg media processing pipeline.

## Project Structure

- `server.ts` — Unified Express + Vite server (port 3000) with CORS, rate limiting, and `/media` static asset serving.
- `server/db.ts` — Embedded SQLite persistence (`./data/aistudio.db`), demo creator seed, and atomic credit ledger.
- `server/gemini.ts` — Server-side `@google/genai` integrations (Chat streaming, Image gen/edit/BG removal, `gemini-omni-1.2-flash` multi-clip video generation, Lyria music generation, TTS voice, audio transcription/SRT, and Social Media campaign generator).
- `server/media.ts` — FFmpeg & FFprobe pipeline for >=60-second multi-clip video concatenation, social ratio cropping/scaling (`9:16`, `16:9`, `1:1`, `4:5`, `21:9`, custom), SRT subtitle burning, video trimming, and MP3/WAV transcoding.
- `server/auth.ts` & `server/routes/*` — JWT authentication, chat threads/messages, background jobs, projects, and downloads.
- `supabase/migrations/001_initial_schema.sql` — Production PostgreSQL + Supabase RLS migration matching the unified schema.
- `src/` — Responsive React + TypeScript + Tailwind CSS v4 web dashboard & studios.
- `android-app/` — Native Android React Native + Expo application connecting to the shared backend.

## Prerequisites

- Node.js 20+
- `ffmpeg` and `ffprobe` installed on `PATH`
- `GEMINI_API_KEY` set in environment secrets

## Local Setup & Web Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment variables based on `.env.example`.
3. Start the unified web + API server:
   ```bash
   npm run dev
   ```
4. Build and run in production:
   ```bash
   npm run build
   npm start
   ```

## Supabase / PostgreSQL Migration

To provision the unified schema on Supabase PostgreSQL:

1. Open the Supabase SQL Editor or run the Supabase CLI:
   ```bash
   supabase db push
   ```
2. Apply `supabase/migrations/001_initial_schema.sql` to create `profiles`, `projects`, `chat_threads`, `chat_messages`, `generation_jobs`, `downloads`, and `credit_transactions` with Row Level Security enabled.

## Native Android App (Expo)

1. Navigate to the Android workspace:
   ```bash
   cd android-app
   npm install
   ```
2. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to your deployed backend URL.
3. Launch on an Android emulator or device:
   ```bash
   npx expo start --android
   ```
4. Build an Android APK/AAB for distribution with EAS:
   ```bash
   npx eas build --platform android
   ```
