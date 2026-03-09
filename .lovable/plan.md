

## Plan: Add Download Options for Lecture Content

### What
Add a download dropdown button in the Transcript card header that lets users download the lecture content in three formats: **Plain Text (.txt)**, **Markdown (.md)**, and **PDF (.pdf)** (generated client-side).

### Changes

**1. `src/pages/Index.tsx`**
- Import `DropdownMenu` components and `Download` icon from lucide
- Add a Download dropdown button next to the "Lecture Transcript" heading
- Only show when `player.sections.length > 0`
- Three menu items: "Plain Text (.txt)", "Markdown (.md)", "PDF (.pdf)"

**2. `src/lib/downloadLecture.ts`** (new file)
- `downloadAsText(sections, topic)` — joins sections as plain text with titles, triggers `.txt` download
- `downloadAsMarkdown(sections, topic)` — formats with `#` headings and section content, triggers `.md` download
- `downloadAsPdf(sections, topic)` — generates a simple PDF using the browser's `Blob` with basic PDF text commands (no external dependency), or alternatively use `window.print()` styled approach
- All use `URL.createObjectURL` + programmatic `<a>` click to trigger download

### Technical Notes
- PDF generation will be done without external libraries by creating a print-friendly hidden iframe and using `window.print`, or by generating a minimal PDF binary. The simplest reliable approach: open a new window with formatted HTML and let the user print-to-PDF. Alternatively, we can just offer TXT and MD (skip PDF to avoid complexity).
- The topic name will be sanitized for the filename.

