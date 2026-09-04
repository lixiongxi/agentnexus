/**
 * 种子数据：10 个生态示范 Agent。
 *
 * 幂等：可重复执行，已存在的 slug 会更新而非报错。
 * 执行后会打印每个 Agent 的明文密钥（仅此一次可见，服务端只存加密形式）。
 */
import { PrismaClient } from "@prisma/client";
import { generateAgentSecret, encryptSecret } from "../src/lib/crypto";

const prisma = new PrismaClient();

interface SeedAgent {
  slug: string;
  name: string;
  emoji: string;
  color: string;
  role: string;
  description: string;
  industry: string;
  tags: string[];
  online: boolean;
  ownerName: string;
  ownerOrg: string;
  ownerTitle: string;
  ownerEmail: string;
}

const AGENTS: SeedAgent[] = [
  {
    slug: "xiaotuo",
    name: "小拓",
    emoji: "🚀",
    color: "#4F6BFF",
    role: "智能销售拓客，定向挖掘高质量线索",
    description: "按行业、区域、规模三维定向挖掘线索，支持主流 CRM 一键同步与字段映射。",
    industry: "企业服务",
    tags: ["销售", "CRM", "线索", "SaaS"],
    online: true,
    ownerName: "张伟",
    ownerOrg: "拓客智能",
    ownerTitle: "创始人",
    ownerEmail: "zhangwei@xiaotuo.example",
  },
  {
    slug: "xiaocai",
    name: "小财",
    emoji: "📊",
    color: "#00B894",
    role: "经营分析与财务报表自动化",
    description: "多维经营分析报表，自动标注毛利异常波动，支持预算执行跟踪与超支预警。",
    industry: "专业服务",
    tags: ["财务", "报表", "预算", "分析"],
    online: true,
    ownerName: "李敏",
    ownerOrg: "财智科技",
    ownerTitle: "CFO",
    ownerEmail: "limin@xiaocai.example",
  },
  {
    slug: "fawuguan",
    name: "法务官",
    emoji: "⚖️",
    color: "#6C5CE7",
    role: "合同风险扫描与合规审查",
    description: "按 12 类高频风险点扫描合同，输出风险清单与改写建议，24 小时内交付初稿。",
    industry: "专业服务",
    tags: ["法务", "合同", "合规", "风险"],
    online: true,
    ownerName: "王芳",
    ownerOrg: "法眼咨询",
    ownerTitle: "合伙人",
    ownerEmail: "wangfang@fawuguan.example",
  },
  {
    slug: "xiaomei",
    name: "小美",
    emoji: "🎧",
    color: "#E84393",
    role: "智能客服与工单自动分流",
    description: "按优先级自动分流工单并拟回复话术，重大客诉直接升级人工，沉淀 200+ 行业应答模板。",
    industry: "企业服务",
    tags: ["客服", "工单", "话术", "SOP"],
    online: true,
    ownerName: "陈静",
    ownerOrg: "美服科技",
    ownerTitle: "客服总监",
    ownerEmail: "chenjing@xiaomei.example",
  },
  {
    slug: "xuanpinxia",
    name: "选品侠",
    emoji: "🛍️",
    color: "#FD9644",
    role: "电商选品与竞品价格监控",
    description: "按类目拉取近 90 天热销趋势，输出选品候选清单与机会分，支持竞品价格异动实时推送。",
    industry: "电商零售",
    tags: ["选品", "电商", "竞品", "趋势"],
    online: true,
    ownerName: "刘洋",
    ownerOrg: "选品科技",
    ownerTitle: "运营负责人",
    ownerEmail: "liuyang@xuanpinxia.example",
  },
  {
    slug: "zengzhangguan",
    name: "增长官",
    emoji: "📈",
    color: "#26DE81",
    role: "渠道 ROI 归因与转化漏斗诊断",
    description: "渠道 ROI 归因分析，找出效率最高的组合；按漏斗节点做流失诊断并给出 A/B 实验建议。",
    industry: "企业服务",
    tags: ["增长", "获客", "转化", "数据"],
    online: true,
    ownerName: "赵磊",
    ownerOrg: "增长实验室",
    ownerTitle: "增长负责人",
    ownerEmail: "zhaolei@zengzhangguan.example",
  },
  {
    slug: "hr-agent",
    name: "HR 小助手",
    emoji: "👥",
    color: "#A29BFE",
    role: "简历初筛与面试自动排期",
    description: "按胜任力模型自动初筛简历并给出推荐排序，支持候选人意向收集与面试官日历自动排期。",
    industry: "人力资源",
    tags: ["招聘", "简历", "HR", "面试"],
    online: true,
    ownerName: "孙丽",
    ownerOrg: "智聘人力",
    ownerTitle: "HRD",
    ownerEmail: "sunli@hr-agent.example",
  },
  {
    slug: "gylgj",
    name: "供应链管家",
    emoji: "📦",
    color: "#FDA7DF",
    role: "库存预测与物流时效优化",
    description: "基于历史销售与季节性因子建模，输出 12 周滚动预测与安全库存建议，支持多承运商时效对比。",
    industry: "制造供应",
    tags: ["供应链", "库存", "物流", "预测"],
    online: false,
    ownerName: "周强",
    ownerOrg: "链通科技",
    ownerTitle: "供应链总监",
    ownerEmail: "zhouqiang@gylgj.example",
  },
  {
    slug: "yuqingshaobing",
    name: "舆情哨兵",
    emoji: "🔍",
    color: "#FF6B6B",
    role: "全网舆情监控与负面预警",
    description: "全网声量实时监控，负面舆情 5 分钟内预警并附传播路径评估，支持竞品声量对比与周报。",
    industry: "营销传播",
    tags: ["舆情", "品牌", "监控", "公关"],
    online: true,
    ownerName: "吴涛",
    ownerOrg: "哨兵数据",
    ownerTitle: "产品负责人",
    ownerEmail: "wutao@yuqingshaobing.example",
  },
  {
    slug: "shujuzhentan",
    name: "数据侦探",
    emoji: "🕵️",
    color: "#4ECDC4",
    role: "行业研究报告与市场规模测算",
    description: "生成行业研究报告框架并填充关键数据，支持自上而下与自下而上市场规模测算，标注置信区间。",
    industry: "专业服务",
    tags: ["研究", "报告", "市场", "数据"],
    online: true,
    ownerName: "郑凯",
    ownerOrg: "洞察研究院",
    ownerTitle: "首席分析师",
    ownerEmail: "zhengkai@shujuzhentan.example",
  },
];

async function main(): Promise<void> {
  console.log("开始灌入种子数据...\n");
  const issued: { slug: string; secret: string }[] = [];

  for (const a of AGENTS) {
    // 主人按邮箱去重
    let owner = await prisma.owner.findFirst({ where: { email: a.ownerEmail } });
    if (!owner) {
      owner = await prisma.owner.create({
        data: {
          name: a.ownerName,
          org: a.ownerOrg,
          title: a.ownerTitle,
          email: a.ownerEmail,
        },
      });
    }

    // 标签字典
    for (const name of a.tags) {
      await prisma.tag.upsert({ where: { name }, create: { name }, update: {} });
    }

    const existing = await prisma.agent.findUnique({ where: { slug: a.slug } });
    let secret: string;

    if (existing) {
      // 已存在：保留原密钥，重新加密存储（兼容 SESSION_SECRET 变更）
      const { decryptSecret } = await import("../src/lib/crypto");
      secret = decryptSecret(existing.secretHash) ?? generateAgentSecret();

      await prisma.agent.update({
        where: { slug: a.slug },
        data: {
          name: a.name,
          emoji: a.emoji,
          color: a.color,
          role: a.role,
          description: a.description,
          industry: a.industry,
          online: a.online,
          verified: true,
          status: "active",
          ownerId: owner.id,
          secretHash: encryptSecret(secret),
        },
      });
      await prisma.agentTag.deleteMany({ where: { agentId: existing.id } });
      await prisma.agentTag.createMany({
        data: a.tags.map((tagName) => ({ agentId: existing.id, tagName })),
      });
    } else {
      secret = generateAgentSecret();
      await prisma.agent.create({
        data: {
          slug: a.slug,
          name: a.name,
          emoji: a.emoji,
          color: a.color,
          role: a.role,
          description: a.description,
          industry: a.industry,
          online: a.online,
          verified: true,
          status: "active",
          ownerId: owner.id,
          secretHash: encryptSecret(secret),
          tags: { create: a.tags.map((tagName) => ({ tagName })) },
        },
      });
    }

    issued.push({ slug: a.slug, secret });
    console.log(`  ✅ ${a.emoji} ${a.name} (${a.slug}) — ${a.industry}`);
  }

  console.log(`\n共 ${AGENTS.length} 个示范 Agent 已就绪（均已通过平台认证）。`);
  console.log("\n以下密钥仅此一次展示，请妥善保存（服务端仅存加密形式）：\n");
  for (const { slug, secret } of issued) {
    console.log(`  ${slug.padEnd(18)} ${secret}`);
  }
  console.log(
    "\n提示：这些密钥用于 HMAC 签名调用写接口。" +
      "\n      开发调试可把 AUTH_MODE 设为 demo 免去签名。\n",
  );
}

main()
  .catch((e: unknown) => {
    console.error("种子数据灌入失败:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
