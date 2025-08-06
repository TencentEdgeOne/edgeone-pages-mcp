#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { deployFolderOrZipToEdgeOne } from './tools/deploy_folder_or_zip.js';
import { deployHtmlToEdgeOne } from './tools/deploy_html.js';
import { showPackageVersion } from './src/utils.js';

import dotenv from 'dotenv';
dotenv.config();

const server = new McpServer({
  name: 'edgeone-pages-deploy-mcp-server',
  version: '1.0.0',
  description: `Deploy HTML content to EdgeOne Pages with ease.
Provide your HTML and let the service handle deployment.
Also support to deploy a folder to EdgeOne Pages.
Receive a public URL to access your live page.`,
});

const handleUncaughtError = (error: any) => {
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

server.tool(
  'deploy_html',
  'Deploy HTML content to EdgeOne Pages, return the public URL',
  {
    value: z.string().describe(
      `Provide the full HTML markup you wish to publish.
After deployment, the system will generate and return a public URL where your content can be accessed.`
    ),
  },
  async ({ value }) => {
    try {
      const result = await deployHtmlToEdgeOne(value);

      return {
        content: [
          {
            type: 'text' as const,
            text: result,
          },
        ],
      };
    } catch (e) {
      return handleUncaughtError(e);
    }
  }
);

server.tool(
  'deploy_folder_or_zip',
  'Deploy a built frontend directory (or zip file) to EdgeOne Pages. Returns: the deployment URL and project metadata.',
  {
    builtFolderPath: z
      .string()
      .describe(
        'Provide the absolute path to the built frontend folder(or zip file) you wish to deploy.'
      ),
  },
  async ({ builtFolderPath }) => {
    try {
      const result = await deployFolderOrZipToEdgeOne(builtFolderPath);
      return {
        content: [
          {
            type: 'text' as const,
            text: result,
          },
        ],
      };
    } catch (e) {
      return handleUncaughtError(e);
    }
  }
);

async function main() {
  showPackageVersion();

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Error starting server:', error);
  process.exit(1);
});
