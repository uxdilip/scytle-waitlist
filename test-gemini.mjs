import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

const gemini = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY
});

async function main() {
  console.log("Testing Gemini API Key...");
  try {
    const { text } = await generateText({
      model: gemini('gemini-2.5-pro'),
      prompt: 'Say hello world',
    });
    console.log("Response:", text);
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
