import dotenv from 'dotenv';
dotenv.config();

import { GoogleGenerativeAI } from '@google/generative-ai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import readline from 'readline';

// Connect to the MCP nutrition server
const transport = new StdioClientTransport({
  command: 'node',
  args: ['nutrition-server.js']
});

const mcpClient = new Client({ name: 'nutrition-agent', version: '1.0.0' });
await mcpClient.connect(transport);

// Get available tools from MCP server
const { tools } = await mcpClient.listTools();
console.log('Tools loaded:', tools.map(t => t.name));

// Convert MCP tools to Gemini function declarations
const geminiTools = [{
  functionDeclarations: tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'OBJECT',
      properties: Object.fromEntries(
        Object.entries(tool.inputSchema.properties || {}).map(([k, v]) => [k, { type: 'STRING', description: v.description }])
      ),
      required: tool.inputSchema.required || []
    }
  }))
}];

// Set up Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  tools: geminiTools,
  systemInstruction: `You are a helpful nutrition assistant. When the user asks about a food, 
  always use the get_nutrition tool to look up real data before giving advice. 
  After getting nutrition data, provide personalized guidance on whether the food 
  is healthy, how much to eat, and tips for a balanced diet.`
});

const chat = model.startChat({ history: [] });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function askQuestion() {
  rl.question('You: ', async (input) => {
    if (input.toLowerCase() === 'exit') {
      console.log('Goodbye!');
      rl.close();
      await mcpClient.close();
      return;
    }

    // Send message to Gemini
    let result = await chat.sendMessage(input);
    let response = result.response;

    // Handle tool calls in a loop (agent might call tools multiple times)
    let functionCalls = response.functionCalls ? response.functionCalls() : null;
    while (functionCalls && functionCalls.length > 0) {
      const functionCall = functionCalls[0];
      console.log(`\n[Looking up: ${functionCall.args.food}...]\n`);

      // Call the MCP tool
      const toolResult = await mcpClient.callTool({
        name: functionCall.name,
        arguments: functionCall.args
      });

      // Send tool result back to Gemini
      result = await chat.sendMessage([{
        functionResponse: {
          name: functionCall.name,
          response: { content: toolResult.content[0].text }
        }
      }]);
      response = result.response;
      functionCalls = response.functionCalls ? response.functionCalls() : null;
    }

    console.log(`\nAgent: ${response.text()}\n`);
    askQuestion();
  });
}

console.log('\n🥦 Nutrition AI Agent ready! Ask me about any food.\n');
askQuestion();