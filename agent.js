require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const readline = require('readline');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// Start a chat session (Gemini handles memory automatically)
const chat = model.startChat({
  history: [],
  generationConfig: { maxOutputTokens: 1024 }
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function askQuestion() {
  rl.question('You: ', async (input) => {
    if (input.toLowerCase() === 'exit') {
      console.log('Goodbye!');
      rl.close();
      return;
    }

    const result = await chat.sendMessage(input);
    const reply = result.response.text();
    console.log(`\nAgent: ${reply}\n`);
    askQuestion();
  });
}

console.log('Your AI agent is ready! Type "exit" to quit.\n');
askQuestion();