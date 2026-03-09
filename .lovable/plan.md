

# AI Voice Teaching Agent

## Architecture

Two edge functions + a React frontend with a custom playback hook.

### Edge Function 1: `generate-lecture`
- Uses **Lovable AI** (google/gemini-3-flash-preview) with tool calling to return structured JSON
- Input: `{ topic, durationMinutes }`
- Output: `{ sections: [{ title, content }] }` — content calibrated to ~130 words/minute
- System prompt instructs the model to generate Introduction, Key Concepts, Examples, Simple Explanation, and Summary sections

### Edge Function 2: `elevenlabs-tts`
- Requires **ElevenLabs connector** (no connection exists yet — will need to set one up)
- Input: `{ text, voiceId, previousText?, nextText? }`
- Uses request stitching for natural flow between sections
- Returns raw MP3 audio bytes
- Voice: "Brian" (`nPczCjzI2devNBz1zQrb`) — clear teaching voice

### Frontend
- **`src/pages/Index.tsx`** — Topic input, duration selector (5/10/15/20 min), "Start Session" button, audio player with Play/Pause/Resume/Restart, live transcript panel showing current section
- **`src/hooks/useLecturePlayer.ts`** — State machine (idle → generating → playing → complete), calls generate-lecture, then iterates sections calling TTS, prefetches next section while current plays, manages Audio API playback

### Config
- `supabase/config.toml` updated with both functions (`verify_jwt = false`)

## Prerequisites
- **ElevenLabs connection** must be linked via connector before implementation. I will prompt you to set this up first.

## Files to Create/Modify
1. `supabase/functions/generate-lecture/index.ts` — new
2. `supabase/functions/elevenlabs-tts/index.ts` — new
3. `src/hooks/useLecturePlayer.ts` — new
4. `src/pages/Index.tsx` — rewrite with teaching agent UI
5. `supabase/config.toml` — add function configs

