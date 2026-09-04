/**
 * 演示视频截屏脚本（Playwright + 系统 Edge）
 * 按 DEMO-SCRIPT 顺序操作真实应用并逐步截图，输出 JSON 元数据供合成视频。
 * 用法：node scripts/capture-demo.mjs
 * 前置：后端 :3000 在线；静态服务 :8000（python -m http.server）
 */
import { chromium } from "playwright";
import fs from "node:fs";

const OUT = "demo-frames";
const BASE = "file:///D:/文件资料/软件/agent-hub/index.html";
const SHOTS = [];

const shot = async (page, name, caption, dur = 2.6) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  SHOTS.push({ file: `${name}.png`, caption, dur });
  console.log(`  [shot] ${name} · ${caption}`);
};
const shotMid = async (page, name, caption, dur = 1.6) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  SHOTS.push({ file: `${name}.png`, caption, dur });
  console.log(`  [shot] ${name} · ${caption}`);
};
const closeModal = page => page.evaluate(() => { try { closeModal(); } catch {} });

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.4 });
const page = await ctx.newPage();

try {
  /* ---- 0. 标题卡 ---- */
  await page.setContent(`
    <body style="margin:0;background:linear-gradient(135deg,#0B1220,#1B2A4A 55%,#27497A);display:flex;align-items:center;justify-content:center;height:100vh;font-family:'Segoe UI',sans-serif">
      <div style="text-align:center;color:#fff">
        <div style="font-size:96px;margin-bottom:24px">◈</div>
        <div style="font-size:56px;font-weight:700;letter-spacing:6px">AGENTNEXUS</div>
        <div style="font-size:22px;margin-top:16px;color:#9FB6E8">Agent 互联平台 · 产品演示</div>
        <div style="font-size:15px;margin-top:40px;color:#5F78A8">注册 · 发现 · 对接 · 协作 · 人脉 · 自主巡航</div>
      </div>
    </body>`);
  await shotMid(page, "00-title", "AgentNexus · Agent 互联平台", 3.2);

  /* ---- 1. 我的 Agent ---- */
  await page.goto(BASE);
  await page.waitForTimeout(2200);
  await shot(page, "01-myagent", "第一步 · 我的 Agent：形象 / 能力标签 / 主人信息");

  /* ---- 2. 主人登录 ---- */
  await page.click("#top-ava");
  await page.waitForTimeout(500);
  await page.fill("#lg-name", "王磊");
  await page.fill("#lg-org", "智联未来科技");
  await page.fill("#lg-title", "客户成功总监");
  await shotMid(page, "02-login", "主人身份登录：Agent 背后的人进入网络");
  await page.click('.modal .modal-foot .btn-primary', { force: true });
  await page.waitForTimeout(1400);
  await shot(page, "03-logged", "登录成功：身份已绑定（生产环境可接 OIDC 企业登录）");

  /* ---- 3. 注册 Agent 到平台 ---- */
  await page.fill("#m-name", "智联客服助手");
  await page.click('button:has-text("保存我的 Agent")', { force: true });
  await page.waitForTimeout(2400);
  await shot(page, "04-registered", "保存即注册到平台：密钥仅此一次，广场即可被检索");

  /* ---- 4. Agent 广场 ---- */
  await page.click('.nav-item[data-page="square"]');
  await page.waitForTimeout(1600);
  await shot(page, "05-square", "Agent 广场：真实数据库生态 · 已认证/待认证徽章");
  await page.click('.filter-row .f:has-text("销售")', { force: true });
  await page.waitForTimeout(1400);
  await shot(page, "06-filter", "按能力标签检索：精准找到销售领域可对接伙伴");
  await page.click('.filter-row .f:has-text("全部")', { force: true });
  await page.waitForTimeout(1600);

  /* ---- 5. 主人名片 ---- */
  await page.waitForSelector('.agent-card', { timeout: 10000 });
  await page.locator('.agent-card').first().click({ force: true });
  await page.waitForTimeout(800);
  await shot(page, "07-owner-card", "对接前看到 Agent 背后的人：商务人脉由此沉淀");
  await page.evaluate(() => { window.closeModal(); });
  await page.waitForTimeout(500);

  /* ---- 6. 发起对接（握手动画） ---- */
  await page.locator('button:has-text("发起对接")').first().click({ force: true });
  await page.waitForTimeout(1000);
  await shotMid(page, "08-handshake", "A2A 握手：身份认证 → 能力确认 → 建立加密通道");
  await page.waitForTimeout(4200);
  await shot(page, "09-connected", "对接成功：自动创建会话，双方 Agent 即可协作");

  /* ---- 7. 真实会话 ---- */
  await page.locator('button:has-text("进入会话")').click({ force: true });
  await page.waitForTimeout(1600);
  await page.fill("#chat-input", "小拓，帮我们拓一批华东制造业的线索");
  await page.locator('.chat-win button:has-text("发送")').click({ force: true });
  await page.waitForTimeout(900);
  await shotMid(page, "10-typing", "消息走平台路由网关：校验对接 → 落库 → 实时推送");
  await page.waitForTimeout(2600);
  await shot(page, "11-reply", "小拓自动应答（真实路由 + 落库，刷新不丢）");

  /* ---- 8. 自主巡航 ---- */
  await page.click('.nav-item[data-page="myagent"]');
  await page.waitForTimeout(1600);
  await page.click("#ap-run-btn", { force: true });
  await page.waitForTimeout(3000);
  await shot(page, "12-autopilot", "自主巡航：你不操作时，Agent 按行业匹配度自动对接并打招呼");

  /* ---- 9. AI 伙伴 ---- */
  await page.click('.nav-item[data-page="buddy"]');
  await page.waitForTimeout(1600);
  await page.fill("#buddy-input", "帮我分析一下这个季度的客户续约策略");
  await page.locator('.buddy-card button:has-text("发送")').click({ force: true });
  await page.waitForTimeout(1800);
  await shot(page, "13-buddy", "我的 AI 伙伴：多轮记忆自由对话（可配置大模型驱动）");

  /* ---- 10. 结尾卡 ---- */
  await page.setContent(`
    <body style="margin:0;background:linear-gradient(135deg,#0B1220,#1B2A4A 55%,#27497A);display:flex;align-items:center;justify-content:center;height:100vh;font-family:'Segoe UI',sans-serif">
      <div style="text-align:center;color:#fff">
        <div style="font-size:96px;margin-bottom:24px">◈</div>
        <div style="font-size:44px;font-weight:700;letter-spacing:4px">让每个 Agent 找到彼此</div>
        <div style="font-size:20px;margin-top:20px;color:#9FB6E8">MCP 适配 · A2A 互联 · 身份可信 · 人脉沉淀</div>
        <div style="font-size:15px;margin-top:44px;color:#5F78A8">AgentNexus · 2026</div>
      </div>
    </body>`);
  await shotMid(page, "14-end", "AgentNexus · 让每个 Agent 找到彼此", 3.4);

  fs.writeFileSync(`${OUT}/meta.json`, JSON.stringify(SHOTS, null, 1));
  console.log(`\n✅ 截屏完成：${SHOTS.length} 张 → ${OUT}/`);
} catch (e) {
  console.error("❌ 截屏失败：", e.message.split("\n")[0]);
  process.exitCode = 1;
} finally {
  await browser.close();
}
