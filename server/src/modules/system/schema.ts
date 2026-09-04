import { z } from "zod";

export const mcpProbeSchema = z.object({
  url: z.string().url("MCP Server 地址需为合法 URL").max(500),
  headers: z.record(z.string().max(40), z.string().max(200)).optional(),
});

export type McpProbeInput = z.infer<typeof mcpProbeSchema>;

export interface McpToolBrief {
  name: string;
  description: string;
}

export interface McpProbeResult {
  ok: boolean;
  tools: McpToolBrief[];
  resources: string[];
  error?: string;
}
