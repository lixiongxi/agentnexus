import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const probeSchema = z.object({
  url: z.string().url("请输入合法的 MCP Server URL"),
  headers: z.record(z.string()).optional().default({})
});

/**
 * POST /api/mcp/probe
 * 连接任意 MCP Server，探测其暴露的工具与资源列表。
 * 这是 M0 验收项：验证平台能连通"市面上的 Agent"。
 */
export function registerMcpRoutes(app: FastifyInstance) {
  app.post("/api/mcp/probe", async (req, reply) => {
    const p = probeSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ ok: false, error: p.error.issues[0]?.message });

    const { url, headers } = p.data;
    const client = new Client({ name: "agenthub-probe", version: "0.1.0" });
    try {
      const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } });
      await client.connect(transport);
      const [toolsRes, resourcesRes] = await Promise.all([
        client.listTools(),
        client.listResources().catch(() => null)
      ]);
      const tools = (toolsRes?.tools ?? []).map(t => ({ name: t.name, description: t.description ?? "", inputSchema: t.inputSchema ?? {} }));
      const resources = resourcesRes?.resources?.length ? resourcesRes.resources.map(r => ({ name: r.name, uri: r.uri })) : [];
      await client.close().catch(() => {});
      return reply.send({
        ok: true,
        url,
        serverInfo: { protocolVersion: toolsRes?._meta ?? undefined },
        toolCount: tools.length,
        tools,
        resourceCount: resources.length,
        resources
      });
    } catch (e: any) {
      return reply.code(502).send({ ok: false, error: `MCP 连接失败: ${e?.message ?? String(e)}` });
    }
  });
}
