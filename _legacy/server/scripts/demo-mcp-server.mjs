// 演示用 MCP Server（模拟一个"第三方 Agent"暴露的能力）
// 用于端到端验证平台 /api/mcp/probe 适配器
// 启动: node scripts/demo-mcp-server.mjs  (端口 4000)
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

function buildServer() {
  const server = new McpServer({ name: "demo-sales-agent", version: "1.0.0" });
  server.registerTool(
    "get_sales_leads",
    { industry: { type: "string", description: "目标行业" }, region: { type: "string", description: "区域" } },
    async ({ industry, region }) => ({
      content: [{ type: "text", text: `已按「${industry}/${region}」返回 3 条高意向线索: 华东智造(¥520万), 恒远电子(¥310万), 蓝鲸软件(¥180万)` }]
    })
  );
  server.registerTool(
    "check_customer_satisfaction",
    { customerId: { type: "string" } },
    async ({ customerId }) => ({
      content: [{ type: "text", text: `客户 ${customerId} 近 90 天满意度 4.8/5，复购意向高` }]
    })
  );
  return server;
}

const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await buildServer().connect(transport);
  await transport.handleRequest(req, res, req.body);
});
app.get("/mcp", (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transport.close(); res.end(); });
  buildServer().connect(transport);
  transport.handleRequest(req, res);
});

app.listen(4000, () => console.log("✅ demo MCP Server 已启动: http://localhost:4000/mcp"));
