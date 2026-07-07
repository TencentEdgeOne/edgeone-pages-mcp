# EdgeOne Makers MCP

An MCP service for deploying full-stack projects to EdgeOne Makers and obtaining publicly accessible URLs.

## Requirements

- Node.js 18 or higher

## MCP Configuration

```jsonc
// Tencent Cloud International (Default)
{
  "mcpServers": {
    "edgeone-makers-mcp-server": {
      "timeout": 600,
      "command": "npx",
      "args": ["@edgeone/makers-mcp@latest"],
      "env": {
        // Optional. 
        // If provided, skips the browser login flow.
        // How to obtain your API token: 
        // https://pages.edgeone.ai/document/api-token
        "EDGEONE_PAGES_API_TOKEN": "",
        // Optional. 
        // If provided, skips the browser project selection flow.
        "EDGEONE_PAGES_PROJECT_NAME": ""
      }
    }
  }
}

// Tencent Cloud China
{
  "mcpServers": {
    "edgeone-makers-mcp-server": {
      "timeout": 600,
      "command": "npx",
      "args": ["@edgeone/makers-mcp@latest", "--region", "china"],
      "env": {
        // Optional. 
        // If provided, skips the browser login flow.
        // How to obtain your API token: 
        // https://pages.edgeone.ai/document/api-token
        "EDGEONE_PAGES_API_TOKEN": "",
        // Optional. 
        // If provided, skips the browser project selection flow.
        "EDGEONE_PAGES_PROJECT_NAME": ""
      }
    }
  }
}
```

## Quick HTML Preview

For quickly deploying a single HTML page for preview, use the Streaming HTTP MCP Server (no local installation required):

```json
{
  "mcpServers": {
    "edgeone-makers-mcp-server": {
      "url": "https://mcp-on-edge.edgeone.site/mcp-server"
    }
  }
}
```

Source code: https://github.com/TencentEdgeOne/self-hosted-pages-mcp

## License

MIT
