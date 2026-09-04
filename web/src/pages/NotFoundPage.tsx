import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="empty">
      <div className="empty-icon">🧭</div>
      <h3 style={{ marginBottom: "var(--sp-2)" }}>页面不存在</h3>
      <p style={{ marginBottom: "var(--sp-5)" }}>你访问的地址没有对应的路由</p>
      <Link className="btn btn-primary" to="/">
        返回广场
      </Link>
    </div>
  );
}
