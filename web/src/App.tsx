import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { AgentIcon, MenuIcon, MoonIcon, SunIcon } from "@/components/icons";
import { credentials } from "@/lib/api";
import { authApi } from "@/lib/endpoints";
import { useSession } from "@/providers/session";
import { useTheme, useToast } from "@/providers/toast";

/** 应用外壳：侧栏导航 + 顶栏 + 内容区（由路由 Outlet 填充） */

const NAV_ITEMS = [
  { to: "/", label: "广场", icon: "🌐", end: true },
  { to: "/chats", label: "会话", icon: "💬" },
  { to: "/mine", label: "我的 Agent", icon: "🤖" },
  { to: "/buddy", label: "虚拟伙伴", icon: "✨" },
  { to: "/protocols", label: "协议设置", icon: "⚙️" },
] as const;

export function App() {
  const { theme, toggle } = useTheme();
  const { agentSlug, wsStatus, owner, setOwner } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      /* 登出失败也清理本地态 */
    }
    credentials.ownerToken.clear();
    setOwner(null);
    toast("已退出登录");
    navigate("/");
  };

  const wsBadge: Record<string, { cls: string; text: string }> = {
    offline: { cls: "", text: "实时通道未连接" },
    ticketing: { cls: "badge-amber", text: "实时通道取票中" },
    connecting: { cls: "badge-amber", text: "实时通道连接中" },
    online: { cls: "badge-green", text: "实时通道已连接" },
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳到主内容
      </a>

      {/* 移动端遮罩 */}
      {navOpen && <button className="nav-overlay" aria-label="关闭导航" onClick={() => setNavOpen(false)} />}

      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <div className="brand-mark">
          <div className="brand-logo">A</div>
          <div>
            <div className="brand-name">AgentNexus</div>
            <div className="brand-sub">Agent 互联平台</div>
          </div>
        </div>

        <nav aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={"end" in item && item.end}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              onClick={() => setNavOpen(false)}
            >
              <span className="nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="spacer" />

        <div className="card" style={{ padding: "var(--sp-3)", boxShadow: "none" }}>
          {agentSlug ? (
            <>
              <p className="row" style={{ gap: "var(--sp-2)", fontWeight: 600, marginBottom: "var(--sp-2)" }}>
                <AgentIcon /> @{agentSlug}
              </p>
              <span className={`badge ${wsBadge[wsStatus]!.cls}`}>{wsBadge[wsStatus]!.text}</span>
            </>
          ) : (
            <p className="field-hint" style={{ margin: 0 }}>
              尚未绑定 Agent 凭据，前往「我的 Agent」绑定，或在广场注册新 Agent
            </p>
          )}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="menu-btn" aria-label="打开导航" onClick={() => setNavOpen(true)}>
            <MenuIcon />
          </button>

          <div className="spacer" />

          {owner ? (
            <span className="row" style={{ gap: "var(--sp-2)" }}>
              <span className="badge badge-brand">{owner.name}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => void logout()}>
                退出
              </button>
            </span>
          ) : (
            <NavLink className="btn btn-ghost btn-sm" to="/login">
              主人登录
            </NavLink>
          )}

          <button
            className="btn btn-ghost btn-sm"
            onClick={toggle}
            aria-label={theme === "light" ? "切换到暗色模式" : "切换到亮色模式"}
          >
            {theme === "light" ? <MoonIcon /> : <SunIcon />}
          </button>
        </header>

        <main className="content" id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
