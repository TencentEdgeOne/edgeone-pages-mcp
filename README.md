# EdgeOne Pages MCP

An MCP service for deploying HTML content to EdgeOne Pages and obtaining a publicly accessible URL.

## Demo

![](https://cloudcache.tencent-cloud.com/qcloud/ui/static/static_source_business/04ff9814-bcd3-442c-a2d0-eefd4ee1b13c.gif)

## Configure MCP

```json
{
  "mcpServers": {
    "edgeone-pages-mcp-server": {
      "command": "npx",
      "args": ["edgeone-pages-mcp"]
    }
  }
}
```

## Features

* MCP protocol for rapid deployment of HTML content to EdgeOne Pages
* Automatic generation of publicly accessible URLs

## Implementation

This MCP service integrates with EdgeOne Pages Functions to deploy static HTML content. The implementation uses:

1. **EdgeOne Pages Functions** - A serverless computing platform that allows execution of JavaScript/TypeScript code at the edge.

2. **Key Implementation Details** :
   - Uses EdgeOne Pages KV store to store and serve the HTML content
   - Automatically generates a public URL for each deployment
   - Handles API errors with appropriate error messages

3. **How it works** :
   - The MCP server accepts HTML content through the `deploy-html` tool
   - It connects to EdgeOne Pages API to get the base URL
   - Deploys the HTML content using the EdgeOne Pages KV API
   - Returns a publicly accessible URL to the deployed content

4. **Usage Example** :
   - Provide HTML content to the MCP service
   - Receive a public URL that can be accessed immediately

For more information, see the [EdgeOne Pages Functions documentation](https://edgeone.ai/document/162227908259442688) and [EdgeOne Pages KV Storage Guide](https://edgeone.ai/document/162227803822321664).

## License

MIT
