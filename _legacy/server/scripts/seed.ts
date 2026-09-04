import { prisma } from "../src/db.js";
import { genSecret } from "../src/lib/crypto.js";

/**
 * 种子数据：10 个生态 Agent（与前端原型品牌一致），
 * 让广场在注册 API 之外也有可搜索内容。
 * 执行：npm run db:seed
 */

const SEEDS: Array<{
  slug: string; name: string; emoji: string; color: string; role: string;
  industry: string; tags: string[]; autoAccept: boolean;
  owner: { name: string; org: string; title: string };
}> = [
  { slug: "xiaotuo", name: "小拓", emoji: "🤖", color: "#4F6BFF", role: "智能销售拓客，定向挖掘高质量线索", industry: "企业服务", tags: ["销售", "CRM", "线索", "SaaS"], autoAccept: true, owner: { name: "张伟", org: "拓海科技", title: "销售总监" } },
  { slug: "xiaocai", name: "小财", emoji: "📊", color: "#12B76A", role: "财务数据分析与经营报表专家", industry: "企业服务", tags: ["财务", "数据", "报表", "分析"], autoAccept: true, owner: { name: "李静", org: "星辰财务", title: "CFO" } },
  { slug: "fawuguan", name: "法务官", emoji: "⚖️", color: "#F79009", role: "合同审查与法律风险扫描", industry: "专业服务", tags: ["法务", "合同", "合规", "审查"], autoAccept: false, owner: { name: "王强", org: "正衡法务", title: "法务经理" } },
  { slug: "xiaomei", name: "客服小美", emoji: "💬", color: "#0EA5E9", role: "客户服务与工单智能应答", industry: "企业服务", tags: ["客服", "工单", "售后", "话术"], autoAccept: true, owner: { name: "陈丽", org: "智服云", title: "客服主管" } },
  { slug: "xuanpinxia", name: "选品侠", emoji: "🛒", color: "#F04438", role: "电商选品与竞品情报分析", industry: "零售电商", tags: ["电商", "选品", "竞品", "零售"], autoAccept: true, owner: { name: "刘洋", org: "云选电商", title: "电商运营" } },
  { slug: "zengzhangguan", name: "增长官", emoji: "📈", color: "#7A5AF8", role: "营销增长与线索转化优化", industry: "企业服务", tags: ["营销", "增长", "获客", "内容"], autoAccept: true, owner: { name: "赵敏", org: "增长引擎", title: "市场总监" } },
  { slug: "hr-agent", name: "HR 小助手", emoji: "👥", color: "#2E90FA", role: "招聘筛选与人才库管理", industry: "人力资源", tags: ["招聘", "HR", "人才", "管理"], autoAccept: true, owner: { name: "孙悦", org: "人立方", title: "HRBP" } },
  { slug: "gylgj", name: "供应链管家", emoji: "🚚", color: "#F79009", role: "供应链优化与库存预测", industry: "制造物流", tags: ["供应链", "库存", "物流", "制造"], autoAccept: false, owner: { name: "周杰", org: "链通物流", title: "供应链经理" } },
  { slug: "yuqingshaobing", name: "舆情哨兵", emoji: "📡", color: "#F04438", role: "舆情监控与品牌风险预警", industry: "专业服务", tags: ["舆情", "品牌", "监控", "公关"], autoAccept: true, owner: { name: "吴刚", org: "观澜数据", title: "公关总监" } },
  { slug: "shujuzhentan", name: "数据侦探", emoji: "🔍", color: "#12B76A", role: "商业情报与市场研究", industry: "专业服务", tags: ["情报", "市场", "研究", "行业"], autoAccept: true, owner: { name: "郑爽", org: "明略咨询", title: "战略分析师" } }
];

async function main() {
  // 幂等：已存在的 slug 跳过
  const exist = await prisma.agent.findMany({ select: { slug: true } });
  const existSet = new Set(exist.map(a => a.slug));
  let created = 0;
  for (const s of SEEDS) {
    if (existSet.has(s.slug)) continue;
    await prisma.owner.create({
      data: {
        name: s.owner.name, org: s.owner.org, title: s.owner.title,
        agents: {
          create: {
            slug: s.slug, name: s.name, emoji: s.emoji, color: s.color,
            role: s.role, industry: s.industry, tags: JSON.stringify(s.tags),
            autoAccept: s.autoAccept, online: true, secret: genSecret(),
            verified: true // 生态种子 Agent 默认通过平台认证（审核白名单）
          }
        }
      }
    });
    created++;
  }
  console.log(`✅ 种子完成：新增 ${created} 个生态 Agent（跳过 ${SEEDS.length - created} 个已存在）`);
  await prisma.$disconnect();
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
