const fs = require("fs");
const path = require("path");
const { PDFParse } = require("pdf-parse");

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function normalizeSpaces(s) {
  let text = s;
  if (Array.isArray(text)) text = text.join("\n");
  // Alcune versioni restituiscono oggetti strutturati
  if (text && typeof text === "object" && "text" in text) text = text.text;
  text = String(text ?? "");
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function compileChapterRegex(pattern) {
  // Default: "Unit 1", "UNIT 1", "Chapter 1", "CHAPTER 1", "Lesson 1"
  const defaultPattern = String.raw`^(?:unit|chapter|lesson)\s+\d+\b.*$`;
  const p = pattern && pattern.trim().length ? pattern : defaultPattern;
  return new RegExp(p, "gim");
}

function splitByChapters(fullText, chapterRegex) {
  const matches = [...fullText.matchAll(chapterRegex)];
  if (matches.length === 0) {
    return [{ title: "FULL_TEXT", content: fullText.trim() }];
  }

  const chapters = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : fullText.length;
    const title = (matches[i][0] || `CHAPTER_${i + 1}`).trim();
    const content = fullText.slice(start, end).trim();
    chapters.push({ title, content });
  }
  return chapters;
}

function safeFileSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "chapter";
}

async function main() {
  const pdfPath = getArg("pdf");
  const outDir = getArg("outDir") || ".";
  const mode = (getArg("mode") || "single").toLowerCase(); // single | split
  const chapterPattern = getArg("chapterPattern");

  if (!pdfPath) {
    console.error("Uso:");
    console.error('  node pdf_to_input.js --pdf "libro.pdf" [--mode single|split] [--outDir .] [--chapterPattern "REGEX"]');
    process.exit(1);
  }

  const resolvedPdf = path.resolve(pdfPath);
  const pdfBuf = fs.readFileSync(resolvedPdf);
  const pdfBytes = new Uint8Array(pdfBuf.buffer, pdfBuf.byteOffset, pdfBuf.byteLength);
  const parser = new PDFParse(pdfBytes);
  await parser.load();
  const text = await parser.getText();
  const fullText = normalizeSpaces(text || "");
  if (!fullText) {
    console.error("❌ Non sono riuscito a estrarre testo dal PDF (forse è scansione/immagine).");
    process.exit(2);
  }

  const chapterRegex = compileChapterRegex(chapterPattern);
  const chapters = splitByChapters(fullText, chapterRegex);

  fs.mkdirSync(outDir, { recursive: true });

  if (mode === "split") {
    const manifest = chapters.map((c, idx) => {
      const slug = safeFileSlug(c.title);
      const filename = `input_${String(idx + 1).padStart(2, "0")}_${slug}.txt`;
      const outPath = path.join(outDir, filename);
      fs.writeFileSync(outPath, c.content + "\n", "utf8");
      return { index: idx + 1, title: c.title, file: filename };
    });

    fs.writeFileSync(path.join(outDir, "chapters.json"), JSON.stringify(manifest, null, 2), "utf8");
    console.log(`✅ Estratti ${chapters.length} capitoli in ${path.resolve(outDir)}`);
    console.log(`✅ Creato manifest chapters.json`);
    return;
  }

  // single
  const outPath = path.join(outDir, "input.txt");
  fs.writeFileSync(outPath, fullText + "\n", "utf8");
  console.log(`✅ Creato ${path.resolve(outPath)} (${chapters.length === 1 ? "senza split" : "split disponibile con --mode split"})`);
}

main().catch((err) => {
  console.error("❌ Errore:", err);
  process.exit(1);
});

