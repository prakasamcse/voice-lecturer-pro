type Section = { title: string; content: string };

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").substring(0, 60) || "lecture";
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadAsText(sections: Section[], topic: string) {
  const name = sanitizeFilename(topic);
  const text = `${topic}\n${"=".repeat(topic.length)}\n\n` +
    sections.map((s) => `${s.title}\n${"-".repeat(s.title.length)}\n${s.content}`).join("\n\n");
  triggerDownload(new Blob([text], { type: "text/plain" }), `${name}.txt`);
}

export function downloadAsMarkdown(sections: Section[], topic: string) {
  const name = sanitizeFilename(topic);
  const md = `# ${topic}\n\n` +
    sections.map((s) => `## ${s.title}\n\n${s.content}`).join("\n\n");
  triggerDownload(new Blob([md], { type: "text/markdown" }), `${name}.md`);
}

export function downloadAsPdf(sections: Section[], topic: string) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${topic}</title>
<style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:0 20px;color:#222}
h1{font-size:24px;margin-bottom:24px}h2{font-size:18px;margin-top:28px;margin-bottom:8px}
p{line-height:1.7;margin:0 0 12px}</style></head><body>
<h1>${topic}</h1>${sections.map((s) => `<h2>${s.title}</h2><p>${s.content}</p>`).join("")}
</body></html>`;
  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 400);
  }
}
