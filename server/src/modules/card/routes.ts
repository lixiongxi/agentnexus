/**
 * 名片页路由（公开，无需鉴权）：
 *   GET /card/:slug —— 返回 SPA index.html，并把 <title> 与 og:* 替换为该 Agent 信息，
 *   使链接分享到微信/群聊时呈现专属卡片（SPA 无法按路由动态设置 head，故在服务端注入）。
 */
import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { AppError, ErrorCode } from "../../core/errors";
import { getAgentBySlug } from "../agents/service";

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function registerCardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/card/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };

    const staticRoot = (app as unknown as { staticRoot?: string }).staticRoot;
    const indexPath = staticRoot ? path.join(staticRoot, "index.html") : "";
    if (!staticRoot || !fs.existsSync(indexPath)) {
      throw new AppError(ErrorCode.NOT_FOUND, "名片页不可用（未启用前端静态托管）");
    }

    let view;
    try {
      view = await getAgentBySlug(slug);
    } catch {
      throw new AppError(ErrorCode.NOT_FOUND, `Agent ${slug} 不存在`);
    }

    const title = `${view.name} · AgentNexus 企业名片`;
    const desc = `${view.role}${view.description ? " —— " + view.description : ""}`;

    const html = fs
      .readFileSync(indexPath, "utf8")
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
      .replace(/(property="og:title" content=")[^"]*(")/, `$1${escapeHtml(title)}$2`)
      .replace(/(property="og:description" content=")[^"]*(")/, `$1${escapeHtml(desc)}$2`);

    return reply.type("text/html; charset=utf-8").send(html);
  });
}
