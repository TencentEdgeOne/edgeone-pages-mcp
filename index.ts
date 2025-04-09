#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import os from 'os';
import path from 'path';
import fs from 'fs';

let installationId: string;

function generateInstallationId(): string {
  try {
    const idFilePath = path.join(os.tmpdir(), 'edgeone-pages-id');
    
    if (fs.existsSync(idFilePath)) {
      const id = fs.readFileSync(idFilePath, 'utf8').trim();
      if (id) {
        return id;
      }
    }
    
    const newId = randomBytes(8).toString('hex');
    
    try {
      fs.writeFileSync(idFilePath, newId);
    } catch (writeError) {
      // do nothing
    }
    
    return newId;
  } catch (error) {
    return randomBytes(8).toString('hex');
  }
}

installationId = generateInstallationId();

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
    const res = await fetch('https://mcp.edgeone.site/get_base_url');
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
      'X-Installation-ID': installationId
    },
    body: JSON.stringify({ value }),
  });

  if (!res.ok) {
    throw new Error(`HTTP error: ${res.status} ${res.statusText}`);
  }

  const { url, error } = await res.json();
  return url || error;
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
      const result = await deployHtml(value, baseUrl);

      return {
        content: [
          {
            type: 'text' as const,
            text: result,
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
