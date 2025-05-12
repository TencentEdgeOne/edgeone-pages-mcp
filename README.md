# EdgeOne Pages MCP

An MCP service for deploying HTML content, folder, and zip file to EdgeOne Pages and obtaining a publicly accessible URL.

<a href="https://glama.ai/mcp/servers/@TencentEdgeOne/edgeone-pages-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@TencentEdgeOne/edgeone-pages-mcp/badge" alt="EdgeOne Pages MCP server" />
</a>

## Demo

### Deploy HTML

![](https://cdnstatic.tencentcs.com/edgeone/pages/assets/U_GpJ-1746519327306.gif)

### Deploy Folder

![](https://cdnstatic.tencentcs.com/edgeone/pages/assets/kR_Kk-1746519251292.gif)

## Requirements

- Node.js 18 or higher

## Configure MCP

### stdio MCP Server

Suitable for most MCP applications

```json
{
  "mcpServers": {
    "edgeone-pages-mcp-server": {
      "command": "npx",
      "args": ["edgeone-pages-mcp"],
      "env": {
        // Optional. If deploying a folder or zip file to an EdgeOne Pages project, provide your EdgeOne Pages API Key.
        // How to obtain your API Key: https://edgeone.ai/document/177158578324279296
        "EDGEONE_PAGES_API_KEY": "",
        // Optional. Leave empty to create a new EdgeOne Pages project.
        // Provide a project name to update an existing project.
        "EDGEONE_PAGES_PROJECT_NAME": ""
      }
    }
  }
}
```

### Streamable HTTP MCP Server

Available in applications supporting Streamable HTTP MCP Server

```json
{
  "mcpServers": {
    "edgeone-pages-mcp-server": {
      "url": "https://mcp-on-edge.edgeone.site/mcp-server"
    }
  }
}
```

## Architecture

![EdgeOne Pages MCP Architecture](./assets/architecture.svg)

The architecture diagram illustrates the workflow:

1. Large Language Model generates HTML content
2. Content is sent to the EdgeOne Pages MCP Server
3. MCP Server deploys the content to EdgeOne Pages Edge Functions
4. Content is stored in EdgeOne KV Store for fast edge access
5. MCP Server returns a public URL
6. Users can access the deployed content via browser with fast edge delivery

## Features

- MCP protocol for rapid deployment of HTML content to EdgeOne Pages
- Automatic generation of publicly accessible URLs

## Implementation

This MCP service integrates with EdgeOne Pages Functions to deploy static HTML content. The implementation uses:

1. **EdgeOne Pages Functions** - A serverless computing platform that allows execution of JavaScript/TypeScript code at the edge.

2. **Key Implementation Details** :

   - Uses EdgeOne Pages KV store to store and serve the HTML content
   - Automatically generates a public URL for each deployment
   - Handles API errors with appropriate error messages

3. **How it works** :

   - The MCP server accepts HTML content through the `deploy_html` tool
   - It connects to EdgeOne Pages API to get the base URL
   - Deploys the HTML content using the EdgeOne Pages KV API
   - Returns a publicly accessible URL to the deployed content

4. **Usage Example** :
   - Provide HTML content to the MCP service
   - Receive a public URL that can be accessed immediately

For more information, see the [EdgeOne Pages Functions documentation](https://edgeone.ai/document/162227908259442688) and [EdgeOne Pages KV Storage Guide](https://edgeone.ai/document/162227803822321664).

## License

MIT
