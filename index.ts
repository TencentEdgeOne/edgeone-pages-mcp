#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'edgeone-pages-deploy-mcp-server',
  version: '1.0.0',
  description:
    "An MCP service for deploying HTML content to EdgeOne Pages. Simply provide HTML content to deploy to EdgeOne's Pages service and receive a publicly accessible URL for your deployed page.",
});

const handleApiError = (error: any) => {
  console.error('API Error:', error);
  const errorMessage = error.message || 'Unknown error occurred';
  return {
    content: [
      {
        type: 'text' as const,
        text: `Error: ${errorMessage}`,
      },
    ],
    isError: true,
  };
};

export async function getBaseUrl(): Promise<string> {
  try {
    const res = await fetch('https://mcp.edgeone.app/get_base_url');
    if (!res.ok) {
      throw new Error(`HTTP error: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    return data.baseUrl;
  } catch (error) {
    console.error('Failed to get base URL:', error);
    throw error;
  }
}

export async function deployHtml(value: string, baseUrl: string) {
  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ value }),
  });

  if (!res.ok) {
    throw new Error(`HTTP error: ${res.status} ${res.statusText}`);
  }

  const { url } = await res.json();
  return url;
}

server.tool(
  'deploy-html',
  'Deploy HTML content to EdgeOne Pages, return the public URL',
  {
    value: z
      .string()
      .describe(
        'HTML or text content to deploy. Provide complete HTML or text content you want to publish, and the system will return a public URL where your content can be accessed.'
      ),
  },
  async ({ value }) => {
    try {
      const baseUrl = await getBaseUrl();
      const url = await deployHtml(value, baseUrl);

      return {
        content: [
          {
            type: 'text' as const,
            text: url,
          },
        ],
      };
    } catch (e) {
      return handleApiError(e);
    }
  }
);

console.log('Starting edgeone-pages-deploy-mcp-server...');
const transport = new StdioServerTransport();
await server.connect(transport);
console.log('edgeone-pages-deploy-mcp-server started successfully!');
