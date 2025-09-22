# EdgeOne Pages MCP

一个用于将 HTML 内容、文件夹或全栈项目部署到 EdgeOne Pages 并获取公开访问链接的 MCP 服务。

<a href="https://glama.ai/mcp/servers/@TencentEdgeOne/edgeone-pages-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@TencentEdgeOne/edgeone-pages-mcp/badge" alt="EdgeOne Pages MCP server" />
</a>

## 演示

### 部署 HTML

![](https://cdnstatic.tencentcs.com/edgeone/pages/assets/U_GpJ-1746519327306.gif)

### 部署文件夹

![](https://cdnstatic.tencentcs.com/edgeone/pages/assets/kR_Kk-1746519251292.gif)

## 环境要求

- Node.js 18 或更高版本

## 配置 MCP

### stdio MCP 服务器

完整功能的 MCP 服务，支持 `deploy_folder` 工具，用于部署全栈项目。

```jsonc
// 腾讯云国际站（默认）
{
  "mcpServers": {
    "edgeone-pages-mcp-server": {
      "timeout": 600,
      "command": "npx",
      "args": ["edgeone-pages-mcp-fullstack"]
    }
  }
}

// 腾讯云中国站
{
  "mcpServers": {
    "edgeone-pages-mcp-server": {
      "timeout": 600,
      "command": "npx",
      "args": ["edgeone-pages-mcp-fullstack", "--region", "china"]
    }
  }
}
```

以下 MCP Server 即将废弃：

支持 `deploy_html` 和 `deploy_folder_or_zip` 两种工具。

```jsonc
{
  "mcpServers": {
    "edgeone-pages-mcp-server": {
      "command": "npx",
      "args": ["edgeone-pages-mcp"],
      "env": {
        // 可选配置。
        // 如果需要将文件夹或 zip 文件部署到 EdgeOne Pages 项目
        // 请提供您的 EdgeOne Pages API 令牌。
        // 获取 API 令牌的方法：
        // https://edgeone.ai/document/177158578324279296
        "EDGEONE_PAGES_API_TOKEN": "",
        // 可选配置。留空将创建新的 EdgeOne Pages 项目。
        // 提供项目名称可更新现有项目。
        "EDGEONE_PAGES_PROJECT_NAME": ""
      }
    }
  }
}
```

### 流式 HTTP MCP 服务器

适用于支持 HTTP 流式传输的 MCP 客户端，仅支持 `deploy_html` 工具。

```json
{
  "mcpServers": {
    "edgeone-pages-mcp-server": {
      "url": "https://mcp-on-edge.edgeone.site/mcp-server"
    }
  }
}
```

## 工具详解

### deploy_html 工具

#### 架构设计

![EdgeOne Pages MCP 架构图](./assets/architecture.svg)

架构图展示了 `deploy_html` 工具的完整工作流程：

1. 大语言模型生成 HTML 内容
2. 内容发送到 EdgeOne Pages MCP 服务器
3. MCP 服务器将内容部署到 EdgeOne Pages 边缘函数
4. 内容存储在 EdgeOne KV 存储中，实现快速边缘访问
5. MCP 服务器返回公开访问链接
6. 用户可通过浏览器访问部署的内容，享受快速的边缘分发服务

#### 实现原理

本工具与 EdgeOne Pages Functions 集成，用于部署静态 HTML 内容：

1. **EdgeOne Pages Functions** - 一个无服务器计算平台，支持在边缘执行 JavaScript/TypeScript 代码

2. **核心实现细节**：

   - 使用 EdgeOne Pages KV 存储来保存和提供 HTML 内容
   - 自动为每次部署生成公开访问链接
   - 提供完善的 API 错误处理和错误信息反馈

3. **工作原理**：
   - MCP 服务器通过 `deploy_html` 工具接收 HTML 内容
   - 连接 EdgeOne Pages API 获取基础 URL
   - 使用 EdgeOne Pages KV API 部署 HTML 内容
   - 返回可立即访问的公开链接

更多信息请参考 [EdgeOne Pages Functions 文档](https://edgeone.ai/document/162227908259442688) 和 [EdgeOne Pages KV 存储指南](https://edgeone.ai/document/162227803822321664)。

源码开源，可以自部署，绑定自定义域名使用：https://github.com/TencentEdgeOne/self-hosted-pages-mcp

### deploy_folder 工具

此工具支持将完整项目部署到 EdgeOne Pages：

- 支持静态网站项目的完整部署
- 支持全栈应用的部署
- 可选择更新现有项目或创建新项目

## 许可证

MIT
