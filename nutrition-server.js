import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fetch from 'node-fetch';

const server = new McpServer({
  name: 'nutrition-server',
  version: '1.0.0'
});

// Tool: Search for food and get nutrition info
server.tool(
  'get_nutrition',
  { food: z.string().describe('The food item to look up, e.g. "banana" or "cheddar cheese"') },
  async ({ food }) => {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(food)}&search_simple=1&action=process&json=1&page_size=1`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.products || data.products.length === 0) {
      return { content: [{ type: 'text', text: `No results found for "${food}". Try a different name.` }] };
    }

    const p = data.products[0];
    const n = p.nutriments || {};

    const info = `
Food: ${p.product_name || food}
Brand: ${p.brands || 'Unknown'}
Serving size: ${p.serving_size || 'Not listed'}

Per 100g:
- Calories: ${n['energy-kcal_100g'] ?? 'N/A'} kcal
- Protein: ${n['proteins_100g'] ?? 'N/A'} g
- Carbohydrates: ${n['carbohydrates_100g'] ?? 'N/A'} g
  - of which sugars: ${n['sugars_100g'] ?? 'N/A'} g
- Fat: ${n['fat_100g'] ?? 'N/A'} g
  - of which saturated: ${n['saturated-fat_100g'] ?? 'N/A'} g
- Fiber: ${n['fiber_100g'] ?? 'N/A'} g
- Salt: ${n['salt_100g'] ?? 'N/A'} g
    `.trim();

    return { content: [{ type: 'text', text: info }] };
  }
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Nutrition MCP server running...');