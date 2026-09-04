/** 平台级常量 */

/**
 * 生态示范 Agent（种子数据）。
 * 定时自主巡航会跳过这批 Agent —— 它们属于平台自带的示范样本，
 * 若参与巡航会在所有用户 Agent 之间互相刷屏式对接。
 */
export const SEED_AGENT_SLUGS: readonly string[] = [
  "xiaotuo",
  "xiaocai",
  "fawuguan",
  "xiaomei",
  "xuanpinxia",
  "zengzhangguan",
  "hr-agent",
  "gylgj",
  "yuqingshaobing",
  "shujuzhentan",
] as const;
