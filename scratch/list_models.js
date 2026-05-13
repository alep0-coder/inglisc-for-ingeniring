const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
async function list() {
  try {
    const models = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // dummy
    // There isn't a direct listModels in the client, but I can try to find the correct name.
    console.log("Try gemini-1.5-flash-latest...");
  } catch (e) {
    console.error(e);
  }
}
list();
