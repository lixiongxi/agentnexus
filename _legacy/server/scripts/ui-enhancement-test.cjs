/* 临时校验脚本：验证界面增强 v2 的新交互是否生效 */
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.resolve(__dirname, "..", "..", "index.html"), "utf8");
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "http://localhost/" });
const w = dom.window;

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ✅ PASS  ${name}`); }
  else { fail++; console.log(`  ❌ FAIL  ${name}  ${detail}`); }
};

setTimeout(() => {
  console.log("== 界面增强 v2 校验 ==");

  // 1. 主题切换
  const before = w.document.documentElement.getAttribute("data-theme");
  w.toggleTheme();
  const after = w.document.documentElement.getAttribute("data-theme");
  check("toggleTheme 切换 data-theme", before !== after, `${before} -> ${after}`);
  check("toggleTheme 持久化到 localStorage", !!w.localStorage.getItem("agenthub_theme"),
    w.localStorage.getItem("agenthub_theme"));

  // 2. 抽屉导航
  w.toggleNav();
  check("toggleNav 打开抽屉 (body.nav-open)", w.document.body.classList.contains("nav-open"));
  check("menu-btn aria-expanded=true", w.document.getElementById("menu-btn").getAttribute("aria-expanded") === "true");
  w.closeNav();
  check("closeNav 关闭抽屉", !w.document.body.classList.contains("nav-open"));

  // 3. Esc 关闭抽屉
  w.toggleNav();
  w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  check("Esc 关闭抽屉", !w.document.body.classList.contains("nav-open"));

  // 4. 搜索防抖函数存在
  check("onGlobalSearchDebounced 已定义", typeof w.onGlobalSearchDebounced === "function");

  // 5. 导航项总数（侧栏 6 + 底部标签栏 6）
  const navCount = w.document.querySelectorAll(".nav-item").length;
  check("nav-item 总数 = 12（侧栏+标签栏）", navCount === 12, "实际=" + navCount);

  // 6. 未读角标同步（原为死代码）
  w.eval("S.connections=[{agentId:'xiaomei',unread:true,since:'09:00',lastMsg:'',lastTime:'09:01'}];");
  w.eval("renderNav();");
  const dot = w.document.getElementById("chat-dot");
  const dotTab = w.document.getElementById("chat-dot-tab");
  check("有未读时 chat-dot 显示", dot.style.display !== "none", "display=" + JSON.stringify(dot.style.display));
  check("有未读时 chat-dot-tab 显示", dotTab.style.display !== "none", "display=" + JSON.stringify(dotTab.style.display));

  w.eval("S.connections=[{agentId:'xiaomei',unread:false,since:'09:00',lastMsg:'',lastTime:'09:01'}];");
  w.eval("renderNav();");
  check("无未读时角标隐藏",
    w.document.getElementById("chat-dot").style.display === "none" &&
    w.document.getElementById("chat-dot-tab").style.display === "none");

  // 7. 无障碍/结构
  check("存在跳转链接 skip-link", !!w.document.querySelector(".skip-link"));
  check("存在 nav-overlay 遮罩", !!w.document.getElementById("nav-overlay"));
  check("搜索框 aria-label", w.document.getElementById("global-search").getAttribute("aria-label") === "全局搜索");

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}, 400);
