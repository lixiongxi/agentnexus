import { z } from "zod";

export const autopilotSettingSchema = z.object({
  enabled: z.boolean().optional(),
  minScore: z.number().int().min(0, "阈值需在 0-100 之间").max(100).optional(),
  autoGreet: z.boolean().optional(),
  industries: z.array(z.string().min(1).max(30)).max(20).optional(),
  tags: z.array(z.string().min(1).max(20)).max(20).optional(),
});

export type AutopilotSettingInput = z.infer<typeof autopilotSettingSchema>;

export interface AutopilotSettingView {
  enabled: boolean;
  minScore: number;
  autoGreet: boolean;
  industries: string[];
  tags: string[];
  updatedAt: string;
}

export interface AutopilotRunResult {
  scanned: number;
  created: number;
  greeted: number;
  details: { toAgent: string; score: number; reason: string; result: string }[];
}

export interface AutopilotLogView {
  id: string;
  toAgent: string;
  score: number;
  reason: string;
  result: string;
  detail: string;
  createdAt: string;
}
