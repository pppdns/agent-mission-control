import { createMCPClient } from "@ai-sdk/mcp";
import { z, type ZodType } from "zod";
import { FETCH_CHAR_LIMIT, SEARCH_RESULTS_PER_QUERY } from "./config";
import { clip } from "./evidence";
import type { ToolContext, ToolDef, ToolResult } from "./tools";

type McpClient = Awaited<ReturnType<typeof createMCPClient>>;

export interface McpServerConfig {
  name: string;
  url: string;
  headers?: Record<string, string>;
}

interface ExposeOptions<I> {
  name: string;
  mcpTool: string;
  description: string;
  inputSchema: ZodType<I>;
  budget: "search" | "fetch" | null;
  validate?: ToolDef<I>["validate"];
  toArguments(input: I): Record<string, unknown>;
  parse(raw: string, input: I, ctx: ToolContext): ToolResult;
}

/**
 * Bridges an MCP server into the ToolRegistry. Only explicitly exposed (allow-listed) tools are reachable:
 * the agent never sees the server's other tools, and each exposure narrows the schema the model works with.
 */
export class McpToolAdapter {
  private reconnecting: Promise<void> | null = null;

  private constructor(
    private readonly config: McpServerConfig,
    private client: McpClient,
    private readonly remoteTools: Map<string, { description?: string; inputSchema: unknown }>,
  ) {}

  get serverName() {
    return this.config.name;
  }

  private static open(config: McpServerConfig): Promise<McpClient> {
    return createMCPClient({
      transport: { type: "http", url: config.url, headers: config.headers },
      clientName: "agent-mission-control",
      initializationOptions: { timeout: 15_000 },
    });
  }

  static async connect(config: McpServerConfig): Promise<McpToolAdapter> {
    const client = await McpToolAdapter.open(config);
    const listed = await client.listTools();
    const remote = new Map(listed.tools.map((t) => [t.name, { description: t.description, inputSchema: t.inputSchema as unknown }]));
    return new McpToolAdapter(config, client, remote);
  }

  /** Replaces the session, e.g. after the process was suspended for a human approval and the old one went stale. */
  private reconnect(): Promise<void> {
    this.reconnecting ??= (async () => {
      const old = this.client;
      this.client = await McpToolAdapter.open(this.config);
      await old.close().catch(() => undefined);
    })().finally(() => {
      this.reconnecting = null;
    });
    return this.reconnecting;
  }

  expose<I>(opts: ExposeOptions<I>): ToolDef<I> {
    const remote = this.remoteTools.get(opts.mcpTool);
    if (!remote) {
      throw new Error(`MCP server "${this.serverName}" does not offer tool "${opts.mcpTool}"`);
    }
    return {
      name: opts.name,
      description: opts.description,
      inputSchema: opts.inputSchema,
      server: this.serverName,
      mcpTool: opts.mcpTool,
      budget: opts.budget,
      displaySchema: remote.inputSchema,
      validate: opts.validate,
      toParams: (input) => opts.toArguments(input),
      execute: async (input, ctx) => {
        const raw = await this.call(opts.mcpTool, opts.toArguments(input));
        return opts.parse(raw, input, ctx);
      },
    };
  }

  private async call(tool: string, args: Record<string, unknown>): Promise<string> {
    let result: Awaited<ReturnType<McpClient["callTool"]>>;
    try {
      result = await this.client.callTool({ name: tool, arguments: args });
    } catch {
      // A thrown error (not an isError result) means the transport or session failed: reconnect once.
      await this.reconnect();
      result = await this.client.callTool({ name: tool, arguments: args });
    }
    const text = (result.content as { type: string; text?: string }[])
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n");
    if (result.isError) throw new Error(text || `${tool} returned an error`);
    return text;
  }

  async close() {
    await this.client.close().catch(() => undefined);
  }
}

const searchInput = z.object({
  query: z.string().min(3).max(300).describe("A focused web search query"),
});

const fetchInput = z.object({
  url: z.string().url().describe("A URL that appeared in an earlier web_search result of this run"),
});

interface TavilyResult {
  url?: string;
  title?: string;
  content?: string;
}

export function exposeTavilySearch(adapter: McpToolAdapter) {
  return adapter.expose({
    name: "web_search",
    mcpTool: "tavily_search",
    description:
      "Search the web (Tavily). Returns up to 5 results, each registered as a citable source with an id like s3. Costs one unit of the shared search budget.",
    inputSchema: searchInput,
    budget: "search",
    toArguments: ({ query }) => ({
      query,
      max_results: SEARCH_RESULTS_PER_QUERY,
      search_depth: "basic",
      include_raw_content: false,
    }),
    parse(raw, input, ctx) {
      let results: TavilyResult[] = [];
      try {
        const parsed = JSON.parse(raw) as { results?: TavilyResult[] };
        results = parsed.results ?? [];
      } catch {
        throw new Error("Search returned an unreadable response");
      }
      const lines: string[] = [];
      const sourceIds: string[] = [];
      for (const r of results) {
        if (!r.url) continue;
        const content = (r.content ?? "").trim();
        const source = ctx.evidence.add({
          url: r.url,
          title: r.title?.trim() || r.url,
          snippet: clip(content, 500),
          content,
          via: "web_search",
          agentId: ctx.agentId,
          query: input.query,
        });
        sourceIds.push(source.id);
        lines.push(`[${source.id}] ${source.title}\n${source.url}\n${clip(content, 900)}`);
      }
      return {
        content: lines.length ? lines.join("\n\n") : "No results. Try a differently worded query.",
        sourceIds,
      };
    },
  });
}

export function exposeFirecrawlScrape(adapter: McpToolAdapter) {
  return adapter.expose({
    name: "fetch_page",
    mcpTool: "firecrawl_scrape",
    description:
      "Fetch the full text of ONE page (Firecrawl). Only URLs that already appeared in this run's web_search results are allowed. Expensive: use sparingly.",
    inputSchema: fetchInput,
    budget: "fetch",
    validate: ({ url }, ctx) =>
      ctx.evidence.hasUrl(url) ? null : "fetch_page only accepts URLs returned by this run's own web_search results.",
    toArguments: ({ url }) => ({ url, formats: ["markdown"], onlyMainContent: true }),
    parse(raw, input, ctx) {
      let markdown = "";
      let title = input.url;
      try {
        const parsed = JSON.parse(raw) as { markdown?: string; metadata?: { title?: string } };
        markdown = parsed.markdown ?? "";
        title = parsed.metadata?.title ?? title;
      } catch {
        markdown = raw;
      }
      if (!markdown.trim()) throw new Error("The page returned no readable content");
      const content = markdown.slice(0, FETCH_CHAR_LIMIT);
      const source = ctx.evidence.add({
        url: input.url,
        title,
        snippet: clip(content, 500),
        content,
        via: "fetch_page",
        agentId: ctx.agentId,
        query: null,
      });
      return { content: `[${source.id}] ${source.title}\n${source.url}\n\n${content}`, sourceIds: [source.id] };
    },
  });
}
