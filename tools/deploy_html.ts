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

/**
 * Get the base URL for EdgeOne Pages deployment
 */
async function getBaseUrl(): Promise<string> {
  const res = await fetch('https://mcp.edgeone.site/get_base_url');
  if (!res.ok) {
    throw new Error(`[getBaseUrl] HTTP error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.baseUrl;
}

/**
 * Deploy HTML content to EdgeOne Pages
 */
async function deployHtml(value: string, baseUrl: string): Promise<string> {
  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Installation-ID': installationId,
    },
    body: JSON.stringify({ value }),
  });

  if (!res.ok) {
    throw new Error(`[deployHtml] HTTP error: ${res.status} ${res.statusText}`);
  }

  const { url } = await res.json();
  return url;
}

/**
 * Deploy HTML content to EdgeOne Pages and return the deployment URL
 */
export const deployHtmlToEdgeOne = async (html: string): Promise<string> => {
  try {
    const baseUrl = await getBaseUrl();
    const url = await deployHtml(html, baseUrl);
    return url;
  } catch (e) {
    console.error('Error deploying HTML:', e);
    throw e;
  }
};
