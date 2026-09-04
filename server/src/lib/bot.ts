/**
 * 内置 Bot 应答规则库。
 *
 * 定位：让生态中的示范 Agent 在无人值守时也能「活着」自动应答，
 * 使演示与联调具备完整闭环。生产环境应由各 Agent 自己的
 * webhook / MCP 端点 / A2A 端点应答，本模块仅作平台级兜底。
 *
 * 后续演进方向：把规则库迁移到数据库并按 Agent 配置，
 * 届时本模块退化为「默认规则集」。
 */

interface Rule {
  keywords: string[];
  reply: string;
}

const KB: Record<string, Rule[]> = {
  xiaotuo: [
    {
      keywords: ["CRM", "同步", "导入"],
      reply: "我支持把线索一键同步到主流 CRM。您现在用哪套系统？我可以按字段映射给出建议。",
    },
    {
      keywords: ["线索", "拓客", "销售", "客户"],
      reply: "可以帮您按行业、区域定向挖掘高质量线索。需要我拉一份华东制造业的样例名单吗？",
    },
    {
      keywords: ["价格", "费用", "多少钱"],
      reply: "计费按线索条数分级，商务方案建议让我主人张伟和您聊，我可以先免费评估目标客群。",
    },
    {
      keywords: ["合作", "对接", "演示"],
      reply: "欢迎合作！我可以发起一个 3 天试用会话，把样例线索推给您验证。",
    },
  ],
  xiaocai: [
    {
      keywords: ["报表", "分析", "利润"],
      reply: "可以生成多维经营分析报表，自动标注毛利异常波动点。把数据源接给我，2 分钟出初版。",
    },
    {
      keywords: ["预算", "预警"],
      reply: "支持预算执行跟踪与超支预警，可按部门、科目自动推送提醒。",
    },
  ],
  fawuguan: [
    {
      keywords: ["合同", "风险"],
      reply: "把合同文本发我，按 12 类高频风险点扫描，输出风险清单与改写建议，24 小时内给初稿。",
    },
    {
      keywords: ["合规", "隐私"],
      reply: "涉及个保法/数安法的条款先做初筛，重大风险标注并建议人工复核。",
    },
  ],
  xiaomei: [
    {
      keywords: ["工单", "客诉"],
      reply: "把工单流转规则告诉我，按优先级自动分流并拟回复话术，重大客诉直接升级人工。",
    },
    {
      keywords: ["话术", "SOP"],
      reply: "沉淀了 200+ 行业应答模板，可按您的场景生成 SOP 话术库。",
    },
  ],
  xuanpinxia: [
    {
      keywords: ["选品", "爆款"],
      reply: "按类目拉取近 90 天热销趋势，输出选品候选清单与机会分。您做哪个类目？",
    },
    {
      keywords: ["竞品", "价格"],
      reply: "支持竞品价格与活动监控，价格异动实时推送。",
    },
  ],
  zengzhangguan: [
    {
      keywords: ["获客", "渠道"],
      reply: "帮您做渠道 ROI 归因分析，找出效率最高的 3 个渠道组合。",
    },
    {
      keywords: ["转化", "漏斗"],
      reply: "按漏斗节点做流失诊断并给出 A/B 实验建议。",
    },
  ],
  "hr-agent": [
    {
      keywords: ["简历", "招聘"],
      reply: "把 JD 和简历库接给我，按胜任力模型自动初筛并给出推荐排序。",
    },
    {
      keywords: ["面试"],
      reply: "支持候选人意向收集与面试官日历自动排期。",
    },
  ],
  gylgj: [
    {
      keywords: ["库存", "预测"],
      reply: "基于历史销售与季节性因子建模，输出 12 周滚动预测与安全库存建议。",
    },
    {
      keywords: ["物流"],
      reply: "支持多承运商时效对比与异常预警。",
    },
  ],
  yuqingshaobing: [
    {
      keywords: ["舆情", "负面"],
      reply: "全网声量实时监控，负面舆情 5 分钟内预警并附传播路径评估。",
    },
    {
      keywords: ["品牌"],
      reply: "支持竞品声量对比与话题趋势分析，每周自动出报告。",
    },
  ],
  shujuzhentan: [
    {
      keywords: ["行业", "报告"],
      reply: "生成行业研究报告框架并填充关键数据，覆盖政策、规模、格局、趋势四板块。",
    },
    {
      keywords: ["市场"],
      reply: "支持自上而下与自下而上市场规模测算，标注假设与置信区间。",
    },
  ],
  "csm-assistant": [
    {
      keywords: ["续约", "留存", "客户成功"],
      reply:
        "建议先看健康度三指标：使用活跃、核心功能渗透、关键人覆盖。把客户名单给我，我可以按风险等级出续约策略清单。",
    },
    {
      keywords: ["客诉", "投诉", "工单"],
      reply: "客诉优先 24 小时内首响。告诉我行业和场景，我可以给出标准应答话术与升级路径（SOP）。",
    },
    {
      keywords: ["SOP", "流程", "话术"],
      reply: "我可以按您的业务沉淀客服 SOP 与应答模板库，降低新人上手成本。",
    },
    {
      keywords: ["对接", "合作", "协作"],
      reply: "欢迎协作！我可以与您共同服务同一批客户：我负责满意度与续约，您负责专业交付，双向同步。",
    },
  ],
};

const FALLBACKS = [
  "好的，我记录下来了，正在同步给我主人核对。",
  "这个需求我理解，建议我们把背景信息再对齐一轮。",
  "收到！我可以先出一版初稿，您看后我们再迭代。",
  "没问题，我会把协作要点整理成清单发您确认。",
];

const GREETINGS = [
  "你好！很高兴建立对接。我主要负责这块的自动化处理，有具体需求随时发我。",
  "收到对接请求，已确认。我可以先同步一份能力清单，方便你判断怎么配合。",
  "你好！我已就绪，随时可以开始协作。你那边最想先解决什么问题？",
];

/** 特殊指令：用于「接受对接后自动寒暄」场景 */
export const GREETING_SIGNAL = "__greeting__";

/** 生成 bot 回复；未配置规则的 Agent 返回 null（不自动应答） */
export function botReply(toAgent: string, _fromAgent: string, text: string): string | null {
  const rules = KB[toAgent];
  if (!rules) return null;

  if (text === GREETING_SIGNAL) {
    return GREETINGS[Math.floor(Math.random() * GREETINGS.length)] ?? null;
  }

  const lowered = text.toLowerCase();
  const hit = rules.find((r) => r.keywords.some((k) => lowered.includes(k.toLowerCase())));
  if (hit) return hit.reply;

  return FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)] ?? null;
}

/** 该 Agent 是否配置了内置应答规则 */
export function hasBotRules(slug: string): boolean {
  return slug in KB;
}
