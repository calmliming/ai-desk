import "server-only";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

import type { McpServerConfig } from "./types";

/**
 * 服务端 MCP 客户端：
 * - 每次聊天请求连接所有启用的服务器（stdio 起本地进程 / http 连远程端点），
 *   收集工具定义并交给模型；
 * - 模型发起 tool_calls 时在这里执行，结果回传模型。
 *
 * 注意：stdio 服务器等于在本机执行用户配置的命令，属于「信任你配置的服务器」，
 * 请只添加可信来源的 MCP。
 */

export interface McpTool {
  serverName: string;
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

const CONNECT_TIMEOUT_MS = 15_000;
const CALL_TIMEOUT_MS = 30_000;
/** 注入模型的工具数量上限（保护上下文长度） */
const MAX_TOOLS = 24;

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export class McpSession {
  private entries: { server: McpServerConfig; client: Client }[] = [];
  private owners = new Map<string, { server: McpServerConfig; client: Client }>();
  tools: McpTool[] = [];

  static enabled(servers?: McpServerConfig[]): McpServerConfig[] {
    return (servers ?? []).filter((s) => s.enabled);
  }

  /** 连接全部服务器并列出工具；单个服务器失败不影响其余 */
  async connect(servers: McpServerConfig[]): Promise<void> {
    for (const server of servers) {
      try {
        const client = new Client({ name: "aidesk", version: "0.1.0" });
        const transport =
          server.type === "stdio"
            ? new StdioClientTransport({
                command: server.command ?? "",
                args: server.args ?? [],
                stderr: "ignore",
              })
            : new StreamableHTTPClientTransport(new URL(server.url ?? "http://localhost"));
        await withTimeout(
          client.connect(transport),
          CONNECT_TIMEOUT_MS,
          `${server.name} 连接超时`,
        );
        const listed = await withTimeout(
          client.listTools(),
          CONNECT_TIMEOUT_MS,
          `${server.name} 列出工具超时`,
        );
        this.entries.push({ server, client });
        for (const t of listed.tools) {
          if (this.tools.length >= MAX_TOOLS) break;
          const tool: McpTool = {
            serverName: server.name,
            name: t.name,
            description: t.description,
            inputSchema: (t.inputSchema ?? { type: "object" }) as Record<string, unknown>,
          };
          this.tools.push(tool);
          this.owners.set(t.name, { server, client });
        }
      } catch (err) {
        console.error(`[mcp] 连接 ${server.name} 失败：`, err);
      }
    }
  }

  /** 执行工具调用，始终返回给模型的文本（执行失败时是错误说明） */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const entry = this.owners.get(name);
    if (!entry) return `错误：没有可用的工具 ${name}`;
    try {
      const result = (await withTimeout(
        entry.client.callTool({ name, arguments: args }, CallToolResultSchema),
        CALL_TIMEOUT_MS,
        `工具 ${name} 执行超时`,
      )) as unknown as { content: Array<{ type: string; text?: string }> };
      const texts = result.content
        .filter((c) => c.type === "text" && typeof c.text === "string")
        .map((c) => c.text as string);
      return texts.length > 0 ? texts.join("\n") : JSON.stringify(result.content);
    } catch (err) {
      return `错误：${err instanceof Error ? err.message : String(err)}`;
    }
  }

  async close(): Promise<void> {
    await Promise.allSettled(this.entries.map((e) => e.client.close()));
    this.entries = [];
    this.owners.clear();
    this.tools = [];
  }
}

/** 把 MCP 工具转成 OpenAI chat/completions 的 tools 格式 */
export function toOpenAiTools(tools: McpTool[]) {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      ...(t.description ? { description: t.description.slice(0, 500) } : {}),
      parameters: {
        type: "object",
        ...t.inputSchema,
        properties: (t.inputSchema.properties as Record<string, unknown>) ?? {},
      },
    },
  }));
}
