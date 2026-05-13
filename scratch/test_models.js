const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
  try {
    // There is no listModels in the high level SDK, but we can try common names.
    const models = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro", "gemini-pro"];
    for (const m of models) {
        try {
            const model = genAI.getGenerativeModel({ model: m });
            await model.generateContent("test");
            console.log(`✅ ${m} works`);
        } catch (e) {
            console.log(`❌ ${m} failed: ${e.message}`);
        }
    }
  } catch (e) {
    console.error(e);
  }
}
listModels();
