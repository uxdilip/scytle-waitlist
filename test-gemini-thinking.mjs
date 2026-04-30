import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

const gemini = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY
});

async function main() {
  console.log("Testing Gemini API Key with Thinking...");
  try {
    const { text } = await generateText({
      model: gemini('gemini-2.5-pro'),
      prompt: 'Say hello world',
      providerOptions: {
        google: { thinkingConfig: { thinkingBudget: 1024 } }
      }
    });
    console.log("Response:", text);
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
