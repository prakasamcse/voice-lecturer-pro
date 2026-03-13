import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) throw new Error("No file provided");

    const fileName = file.name.toLowerCase();
    let text = "";

    let sections: { title: string; content: string }[] | null = null;

    if (fileName.endsWith(".txt") || fileName.endsWith(".md") || fileName.endsWith(".csv")) {
      text = await file.text();
    } else if (fileName.endsWith(".pdf")) {
      text = await extractPdfText(file);
    } else if (fileName.endsWith(".docx")) {
      text = await extractDocxText(file);
    } else if (fileName.endsWith(".pptx") || fileName.endsWith(".ppt")) {
      const result = await extractPptText(file);
      text = result.text;
      sections = result.sections;
    } else {
      text = await file.text();
    }

    text = text.trim();
    if (!text) throw new Error("No text content found in the document");

    return new Response(JSON.stringify({ text, charCount: text.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-document-text error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function extractPdfText(file: File): Promise<string> {
  // Use AI to extract text from PDF
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const base64 = btoa(String.fromCharCode(...bytes));

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "file",
              file: {
                filename: file.name,
                file_data: `data:application/pdf;base64,${base64}`,
              },
            },
            {
              type: "text",
              text: "Extract ALL the text content from this document. Return ONLY the text, no commentary, no markdown formatting. Preserve paragraph breaks.",
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("PDF extraction error:", response.status, errText);
    throw new Error("Failed to extract text from PDF");
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function extractDocxText(file: File): Promise<string> {
  // DOCX files are ZIP archives containing XML. Extract the main document body.
  // We'll use a simple approach: read the raw bytes and extract text between XML tags.
  const buffer = await file.arrayBuffer();

  // Use AI to extract since we can't easily unzip in edge functions
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const bytes = new Uint8Array(buffer);
  
  // For large files, chunk the base64 encoding to avoid stack overflow
  let base64 = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    base64 += btoa(String.fromCharCode(...chunk));
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "file",
              file: {
                filename: file.name,
                file_data: `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${base64}`,
              },
            },
            {
              type: "text",
              text: "Extract ALL the text content from this document. Return ONLY the text, no commentary, no markdown formatting. Preserve paragraph breaks.",
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("DOCX extraction error:", response.status, errText);
    throw new Error("Failed to extract text from DOCX");
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}
