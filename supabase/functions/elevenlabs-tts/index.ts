import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, targetLanguage = "en-IN", speaker = "anushka" } = await req.json();
    const SARVAM_API_KEY = Deno.env.get("SARVAM_API_KEY");
    if (!SARVAM_API_KEY) throw new Error("SARVAM_API_KEY is not configured");

    // Sarvam TTS has a 500 character limit per request, split if needed
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= 500) {
        chunks.push(remaining);
        break;
      }
      // Find a good split point
      let splitAt = remaining.lastIndexOf('. ', 499);
      if (splitAt === -1) splitAt = remaining.lastIndexOf(' ', 499);
      if (splitAt === -1) splitAt = 499;
      else splitAt += 1;
      chunks.push(remaining.slice(0, splitAt).trim());
      remaining = remaining.slice(splitAt).trim();
    }

    const audioBuffers: Uint8Array[] = [];

    for (const chunk of chunks) {
      const response = await fetch("https://api.sarvam.ai/text-to-speech", {
        method: "POST",
        headers: {
          "api-subscription-key": SARVAM_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: [chunk],
          target_language_code: targetLanguage,
          speaker,
          model: "bulbul:v2",
          enable_preprocessing: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Sarvam error:", response.status, errorText);
        throw new Error(`Sarvam TTS failed [${response.status}]: ${errorText}`);
      }

      const data = await response.json();
      // Sarvam returns { audios: ["base64-encoded-wav"] }
      const base64Audio = data.audios?.[0];
      if (!base64Audio) throw new Error("No audio returned from Sarvam");

      // Decode base64 to bytes
      const binaryStr = atob(base64Audio);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      audioBuffers.push(bytes);
    }

    // Concatenate all audio buffers (WAV - just concat raw PCM after first header for simplicity)
    // For single chunk, return as-is
    if (audioBuffers.length === 1) {
      return new Response(audioBuffers[0].buffer, {
        headers: { ...corsHeaders, "Content-Type": "audio/wav" },
      });
    }

    // For multiple chunks, return first chunk's full WAV + subsequent raw data (skip 44-byte WAV headers)
    const totalLength = audioBuffers.reduce((sum, buf, i) => sum + (i === 0 ? buf.length : Math.max(0, buf.length - 44)), 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (let i = 0; i < audioBuffers.length; i++) {
      const buf = i === 0 ? audioBuffers[i] : audioBuffers[i].slice(44);
      combined.set(buf, offset);
      offset += buf.length;
    }

    // Update WAV header with correct data size
    const dataSize = totalLength - 44;
    const fileSize = totalLength - 8;
    combined[4] = fileSize & 0xff;
    combined[5] = (fileSize >> 8) & 0xff;
    combined[6] = (fileSize >> 16) & 0xff;
    combined[7] = (fileSize >> 24) & 0xff;
    combined[40] = dataSize & 0xff;
    combined[41] = (dataSize >> 8) & 0xff;
    combined[42] = (dataSize >> 16) & 0xff;
    combined[43] = (dataSize >> 24) & 0xff;

    return new Response(combined.buffer, {
      headers: { ...corsHeaders, "Content-Type": "audio/wav" },
    });
  } catch (e) {
    console.error("sarvam-tts error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
