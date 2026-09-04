/**
 * AgentNexus 前端回归测试（jsdom）
 *
 * 覆盖高风险场景（REGRESSION-CHECKLIST.md 对应项）：
 *  R1  Autopilot 自动对接 + 未读消息 + 广场数据未加载 → 页面渲染不崩溃（历史 bug）
 *  R2  AI 伙伴页打字时收到 WS 消息 → 输入内容不丢失（不丢字）
 *  R3  离线回退：apiOnline=false 时各页面正常渲染
 *
 * 运行：node scripts/frontend-regression.mjs   （期望输出全部 PASS）
 */
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";

const HTML_PATH = path.resolve("..", "index.html");
const html = fs.readFileSync(HTML_PATH, "utf8");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  ✅ PASS  ${name}`); }
  else { fail++; console.log(`  ❌ FAIL  ${name}  ${detail}`); }
}

const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "http://localhost/" });
const { window } = dom;
const evalJs = (code) => window.eval(code);

console.log("== 前端回归测试 ==");

/* ---------- R1：Autopilot 自动对接 slug + 未读 + 广场未加载 → 渲染不崩溃 ---------- */
try {
  // 构造历史 bug 的精确前置条件：squareReal 未加载（null）、连接里有真实 slug、存在未读
  evalJs(`
    squareReal = null;
    S.connections = [
      { agentId: 'xiaomei', since: '09:00', lastMsg: '客服小美: 你好', lastTime: '09:01', unread: true },
      { agentId: 'svc-agent', since: '08:00', lastMsg: '', lastTime: '08:00', unread: false }
    ];
    S.contacts = [{ agentId: 'xiaomei' }];
    S.chats = {};
  `);
  // 1a. getAgent 对真实 slug 返回兜底而非 null
  const g = evalJs(`getAgent('xiaomei')`);
  check("R1a getAgent('xiaomei') 返回占位对象", g && g.name === 'xiaomei' && !!g.color, JSON.stringify(g));
  // 1b. 会话列表页渲染不抛错且包含 xiaomei
  const chatsHtml = evalJs(`pageChats()`);
  check("R1b pageChats() 渲染不崩溃且含 xiaomei", chatsHtml.includes('xiaomei'), "len=" + (chatsHtml||"").length);
  // 1c. 会话窗口渲染不抛错
  const winHtml = evalJs(`chatWindow(S.connections[0])`);
  check("R1c chatWindow(xiaomei) 渲染不崩溃", winHtml.includes('客服小美') || winHtml.includes('xiaomei'));
  // 1d. 通知中心渲染不抛错（未读连接 → 通知）
  evalJs(`notiOpen=true;`);
  evalJs(`renderNoti()`);
  const notiHtml = window.document.getElementById('noti-pop').innerHTML;
  check("R1d renderNoti() 未读通知渲染不崩溃", notiHtml.includes('xiaomei') || notiHtml.length > 0);
  // 1e. 主人人脉渲染不崩溃
  const contactsHtml = evalJs(`pageContacts()`);
  check("R1e pageContacts() 渲染不崩溃", contactsHtml.length > 0);
  evalJs(`notiOpen=false; curPage='chats';`);
} catch (e) {
  check("R1 整体", false, e.message);
}

/* ---------- R2：AI 伙伴页打字时收到 WS 消息 → 输入不丢字 ---------- */
try {
  evalJs(`curPage='buddy'; curChat=null; S.myAgent.platformSlug='svc-agent-8f3k';`);
  evalJs(`view.innerHTML = pageBuddy()`);
  const input = window.document.getElementById('buddy-input');
  input.value = '我正在输入的一段话，不能被冲掉';
  // 模拟 WS 收到其他 Agent 的消息（非当前会话页）→ 旧逻辑会全页 render 清空输入
  evalJs(`onWsMessage({ fromAgent:'xiaotuo', toAgent:'svc-agent-8f3k', text:'你好', createdAt:new Date().toISOString(), id:'m1' })`);
  const after = window.document.getElementById('buddy-input').value;
  check("R2 WS 消息到达后 buddy 输入框内容保留", after === '我正在输入的一段话，不能被冲掉', `实际="${after}"`);
  evalJs(`curPage='chats';`);
} catch (e) {
  check("R2 整体", false, e.message);
}

/* ---------- R3：离线模式（apiOnline=false）各页面渲染不崩溃 ---------- */
try {
  evalJs(`apiOnline=false; apiChecked=true; squareReal=null; updateApiBadge();`);
  const pages = ['myagent','buddy','square','chats','contacts','protocols'];
  for (const p of pages) {
    const out = evalJs(`curPage='${p}'; render(); 'rendered'`);
    check(`R3 离线模式 ${p} 页渲染`, out === 'rendered');
  }
} catch (e) {
  check("R3 整体", false, e.message);
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
