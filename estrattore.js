const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("❌ Missing GEMINI_API_KEY in .env");
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(API_KEY);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}// ─── System Prompt ────────────────────────────────────────────────────────────
const systemPrompt = `
You are an expert instructional designer creating a Duolingo-style English learning app
based on "Professional English in Use Engineering" by Mark Ibbotson (Cambridge University Press).

Your task: analyze a chunk of the textbook and produce structured JSON for the app.

## CRITICAL RULES

1. **EVERYTHING must be in English.** All questions, options, hints, explanations, theory — 100% English. NEVER use Italian, Spanish, or any other language.
2. **Output MUST be a valid JSON array** of Unit objects with the EXACT structure shown below.
3. **Extract theory from the LEFT-HAND pages** (the teaching content with bold key terms).
4. **Extract exercises from the RIGHT-HAND pages** (numbered exercises like 1.1, 1.2, etc.) and from the Answer Key if present.
5. **Be faithful to the book** — use the actual terminology, questions, and answers from the text.
6. **NO EMPTY FIELDS.** Every exercise MUST have a question. Every "multiple_choice" MUST have 4 options. Every "matching" MUST have at least 3 pairs. Every "fill_in_the_blank" MUST have at least one blank.

## JSON Structure (STRICT — follow exactly)

\`\`\`json
[
  {
    "unit": "Unit Title (e.g., Unit 1: Drawings)",
    "lessons": [
      {
        "title": "Lesson Title (e.g., Drawing types and scales)",
        "theory": "Markdown-formatted theory text extracted from the left-hand page. Use **bold** for key engineering terms. Use bullet points for lists. Use ## for sub-headings. This should be comprehensive enough for the student to learn the material before doing exercises.",
        "exercises": [
          {
            "type": "multiple_choice",
            "question": "Question text in English",
            "options": [
              { "text": "Option A", "is_correct": true },
              { "text": "Option B", "is_correct": false },
              { "text": "Option C", "is_correct": false },
              { "text": "Option D", "is_correct": false }
            ],
            "hint": "A helpful hint in English",
            "explanation": "Why this answer is correct, in English"
          },
          {
            "type": "fill_in_the_blank",
            "question": "Sentence with ____ for each blank.",
            "blanks": [
              { "position": 1, "answer": "correct_word" }
            ],
            "accepted_answers": [
              ["correct_word"],
              ["alternative_word"]
            ],
            "hint": "Hint in English",
            "explanation": "Explanation in English"
          },
          {
            "type": "matching",
            "question": "Match the terms to their definitions.",
            "pairs": [
              { "term": "Term 1", "definition": "Definition 1" },
              { "term": "Term 2", "definition": "Definition 2" },
              { "term": "Term 3", "definition": "Definition 3" }
            ],
            "hint": "Hint in English",
            "explanation": "Explanation in English"
          }
        ]
      }
    ]
  }
]
\`\`\`

## IMPORTANT DETAILS

- Each unit in the book covers a 2-page spread: left page = theory, right page = exercises.
- The book has 45 units grouped into 9 themes (Design, Measurement, Materials Technology, etc.).
- For "fill_in_the_blank": the "accepted_answers" is an array of arrays. Each inner array represents one valid combination of answers for all blanks.
- Generate 4-6 exercises per lesson, mixing all three types.
- Include the Answer Key answers when available in the text.
- The "theory" field should be a proper Markdown summary of the teaching content (300-600 words per lesson).

Return ONLY the JSON array, no markdown code fences.
`;

// ─── Chunk the full text by page markers ──────────────────────────────────────
function chunkByPages(fullText, pagesPerChunk = 6) {
  const pages = fullText.split(/-- \d+ of \d+ --/i);
  const chunks = [];
  let currentChunk = "";
  let pageCount = 0;

  for (const page of pages) {
    if (page.trim().length === 0) continue;
    currentChunk += page + "\n\n";
    pageCount++;
    if (pageCount >= pagesPerChunk) {
      chunks.push(currentChunk);
      currentChunk = "";
      pageCount = 0;
    }
  }
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk);
  }
  return chunks;
}

function cleanJsonText(text) {
  return String(text ?? "").replace(/```json/g, "").replace(/```/g, "").trim();
}

// ─── API call with retry logic ────────────────────────────────────────────────
async function generateWithRetries(prompt) {
  let attempt = 0;
  let rateLimitAttempts = 0;
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
  }, { apiVersion: "v1" });

  while (true) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/quota exceeded|too many requests|429|resource exhausted/i.test(msg)) {
        rateLimitAttempts++;
        const waitSec = Math.min(60 * rateLimitAttempts, 300);
        console.log(`⏳ Rate limit (attempt ${rateLimitAttempts}). Waiting ${waitSec}s...`);
        if (rateLimitAttempts > 10) {
          throw new Error("Too many rate limit retries. Try again later.");
        }
        await sleep(waitSec * 1000);
        continue;
      }
      attempt++;
      if (attempt >= 3) throw e;
      console.log(`⚠️ Attempt ${attempt} failed: ${msg}. Retrying in ${3 * attempt}s...`);
      await sleep(3000 * attempt);
    }
  }
}

// ─── Normalize a unit object to ensure consistent structure ───────────────────
function normalizeUnit(raw) {
  // Handle nested structure: { unit: { title: "...", lessons: [...] } }
  if (raw.unit && typeof raw.unit === "object") {
    return {
      unit: raw.unit.title || raw.unit.unit || "Unknown Unit",
      lessons: normalizeLessons(raw.unit.lessons || raw.lessons || []),
    };
  }
  return {
    unit: raw.unit || raw.unit_title || raw.title || "Unknown Unit",
    lessons: normalizeLessons(raw.lessons || []),
  };
}

function normalizeLessons(lessons) {
  if (!Array.isArray(lessons)) return [];
  return lessons
    .map((l) => ({
      title: l.title || l.lesson_title || "Untitled Lesson",
      theory: l.theory || "",
      exercises: normalizeExercises(l.exercises || []),
    }))
    .filter((l) => l.exercises.length > 0);
}

function normalizeExercises(exercises) {
  if (!Array.isArray(exercises)) return [];
  return exercises
    .map((ex) => {
      const base = {
        type: ex.type,
        question: ex.question || "",
        hint: ex.hint || "",
        explanation: ex.explanation || "",
      };

      if (ex.type === "multiple_choice") {
        let options = ex.options || [];
        // Handle options that are just strings with a separate correct_answer
        if (options.length > 0 && typeof options[0] === "string") {
          const correctAnswer = ex.correct_answer || "";
          options = options.map((o) => ({
            text: o,
            is_correct: o.toLowerCase() === correctAnswer.toLowerCase(),
          }));
        }
        // Ensure at least one correct answer
        const hasCorrect = options.some((o) => o.is_correct);
        if (!hasCorrect && options.length > 0) {
          options[0].is_correct = true;
        }
        return { ...base, options };
      }

      if (ex.type === "fill_in_the_blank") {
        return {
          ...base,
          blanks: ex.blanks || [{ position: 1, answer: "" }],
          accepted_answers: ex.accepted_answers || [
            (ex.blanks || []).map((b) => b.answer || ""),
          ],
        };
      }

      if (ex.type === "matching") {
        return {
          ...base,
          pairs: (ex.pairs || []).map((p) => ({
            term: p.term || p.left || "",
            definition: p.definition || p.right || "",
          })),
        };
      }

      return null;
    })
    .filter(Boolean);
}

// ─── Merge units with the same name ───────────────────────────────────────────
function mergeUnits(allUnits) {
  const merged = [];
  const nameMap = new Map();

  for (const unit of allUnits) {
    const key = unit.unit.toLowerCase().replace(/\s+/g, " ").trim();
    if (nameMap.has(key)) {
      const existing = nameMap.get(key);
      existing.lessons.push(...unit.lessons);
    } else {
      const copy = { ...unit, lessons: [...unit.lessons] };
      merged.push(copy);
      nameMap.set(key, copy);
    }
  }

  return merged;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const inputPath = path.resolve("input.txt");
  if (!fs.existsSync(inputPath)) {
    console.error("❌ input.txt not found.");
    process.exit(1);
  }

  const fullText = fs.readFileSync(inputPath, "utf8");
  // Process ALL chunks — each chunk is 10 pages
  const chunks = chunkByPages(fullText, 10);
  console.log(`📘 Total chunks to process: ${chunks.length}`);

  // Support --resume to skip already-processed chunks
  const resumeArg = process.argv.find((a) => a.startsWith("--resume="));
  const resumeFrom = resumeArg ? parseInt(resumeArg.split("=")[1], 10) : 0;

  let allUnits = [];
  const workDir = path.resolve(".work/chunks");
  fs.mkdirSync(workDir, { recursive: true });

  // Load existing progress if resuming
  if (resumeFrom > 0) {
    const progressPath = path.join(workDir, "progress.json");
    if (fs.existsSync(progressPath)) {
      const prev = JSON.parse(fs.readFileSync(progressPath, "utf8"));
      allUnits = prev.units || [];
      console.log(`📂 Resuming from chunk ${resumeFrom + 1}, loaded ${allUnits.length} existing units`);
    }
  }

  // Also prepare output dir
  const outDir = path.resolve("web/public");
  fs.mkdirSync(outDir, { recursive: true });

  for (let i = resumeFrom; i < chunks.length; i++) {
    console.log(`\n🧠 [${i + 1}/${chunks.length}] Extracting from chunk (${chunks[i].length} chars)...`);

    fs.writeFileSync(path.join(workDir, `chunk_${i + 1}.txt`), chunks[i], "utf8");

    const prompt = `${systemPrompt}\n\nExtract all units and their lessons from the following chunk of "Professional English in Use Engineering".

Remember:
- EVERYTHING in English (questions, hints, explanations, theory)
- Theory should be comprehensive Markdown from the left-hand page
- Exercises should be faithful to the book's right-hand page exercises
- Use the exact JSON structure specified

Text chunk ${i + 1}/${chunks.length}:

${chunks[i]}`;

    try {
      const rawRes = await generateWithRetries(prompt);
      const cleaned = cleanJsonText(rawRes);

      // Save raw response for debugging
      fs.writeFileSync(
        path.join(workDir, `response_${i + 1}.json`),
        cleaned,
        "utf8"
      );

      let parsed = JSON.parse(cleaned);

      // Handle if the response is wrapped in { "units": [...] }
      if (!Array.isArray(parsed) && parsed.units && Array.isArray(parsed.units)) {
        parsed = parsed.units;
      }
      if (!Array.isArray(parsed)) {
        parsed = [parsed];
      }

      // Normalize all units
      const normalized = parsed.map(normalizeUnit).filter((u) => u.lessons.length > 0);

      if (normalized.length > 0) {
        allUnits.push(...normalized);
        console.log(`✅ Extracted ${normalized.length} units from chunk ${i + 1}.`);
        normalized.forEach((u) =>
          console.log(`   📖 ${u.unit} (${u.lessons.length} lessons, ${u.lessons.reduce((a, l) => a + l.exercises.length, 0)} exercises)`)
        );
      } else {
        console.log(`⏭️  No valid units found in chunk ${i + 1} (might be ToC, intro, appendix, etc.).`);
      }
    } catch (e) {
      console.error(`⚠️ Error processing chunk ${i + 1}:`, e.message);
    }

    // Save intermediate progress
    const intermediate = mergeUnits(allUnits);
    fs.writeFileSync(
      path.join(workDir, "progress.json"),
      JSON.stringify({ units: intermediate }, null, 2),
      "utf8"
    );

    // Polite delay between API calls
    if (i < chunks.length - 1) {
      console.log("   ⏳ Waiting 15s before next chunk...");
      await sleep(15000);
    }
  }

  // Final merge and save
  const finalUnits = mergeUnits(allUnits);

  // Stats
  const totalLessons = finalUnits.reduce((a, u) => a + u.lessons.length, 0);
  const totalExercises = finalUnits.reduce(
    (a, u) => a + u.lessons.reduce((a2, l) => a2 + l.exercises.length, 0),
    0
  );

  const outPath = path.join(outDir, "unit_database.json");
  fs.writeFileSync(outPath, JSON.stringify({ units: finalUnits }, null, 2), "utf8");

  console.log(`\n🎉 Done! Saved to ${outPath}`);
  console.log(`   📊 ${finalUnits.length} units, ${totalLessons} lessons, ${totalExercises} exercises`);
}

main().catch(console.error);