import type { McpServerConfig } from "./mcp";

/** Remote MCP endpoints for the two v1 tools, authenticated from the environment. */
export function mcpServersFromEnv(env: Record<string, string | undefined>): {
  tavily: McpServerConfig;
  firecrawl: McpServerConfig;
} {
  const tavilyKey = env.TAVILY_API_KEY;
  const firecrawlKey = env.FIRECRAWL_API_KEY;
  if (!tavilyKey) throw new Error("TAVILY_API_KEY is not set");
  if (!firecrawlKey) throw new Error("FIRECRAWL_API_KEY is not set");
  return {
    tavily: {
      name: "tavily",
      url: "https://mcp.tavily.com/mcp/",
      headers: { Authorization: `Bearer ${tavilyKey}` },
    },
    firecrawl: {
      name: "firecrawl",
      url: `https://mcp.firecrawl.dev/${firecrawlKey}/v2/mcp`,
    },
  };
}
