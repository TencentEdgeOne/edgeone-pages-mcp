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
