import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Set up MCP client and Gemini model (similar to agent.js)
const transport = new StdioClientTransport({
  command: 'node',
  args: ['nutrition-server.js']
});

const mcpClient = new Client({ name: 'nutrition-agent-web', version: '1.0.0' });
await mcpClient.connect(transport);

const { tools } = await mcpClient.listTools();

const geminiTools = [{
  functionDeclarations: tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'OBJECT',
      properties: Object.fromEntries(
        Object.entries(tool.inputSchema.properties || {}).map(([k, v]) => [
          k,
          { type: 'STRING', description: v.description }
        ])
      ),
      required: tool.inputSchema.required || []
    }
  }))
}];

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  tools: geminiTools,
  systemInstruction: `You are a helpful nutrition assistant. When the user asks about a food, 
  always use the get_nutrition tool to look up real data before giving advice. 
  After getting nutrition data, provide personalized guidance on whether the food 
  is healthy, how much to eat, and tips for a balanced diet.`
});

// For simplicity we use a single-turn chat per request
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Missing message' });
    }

    const chat = model.startChat({ history: [] });
    let result = await chat.sendMessage(message);
    let response = result.response;

    // Handle potential tool calls
    let functionCalls = response.functionCalls ? response.functionCalls() : null;
    while (functionCalls && functionCalls.length > 0) {
      const functionCall = functionCalls[0];

      const toolResult = await mcpClient.callTool({
        name: functionCall.name,
        arguments: functionCall.args
      });

      result = await chat.sendMessage([{
        functionResponse: {
          name: functionCall.name,
          response: { content: toolResult.content[0].text }
        }
      }]);
      response = result.response;
      functionCalls = response.functionCalls ? response.functionCalls() : null;
    }

    res.json({ reply: response.text() });
  } catch (err) {
    console.error('Error handling /api/chat:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Web chat server running at http://localhost:${port}`);
});
