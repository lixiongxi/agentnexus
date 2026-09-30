/**
 * API 层：与后端路由一一对应（与 Web/移动端共用同一套接口）
 */
const http = require("./request");

const Auth = {
  /** 一体化注册：账号 + 首个 Agent（返回 token / agent / secret） */
  registerWithAgent({ name, org, email, password, agentName, agentRole, agentIndustry }) {
    return http.post("/api/auth/register-with-agent", {
      name,
      org,
      email,
      password,
      agent: { name: agentName, role: agentRole, industry: agentIndustry || undefined },
    });
  },
  login(email, password) {
    return http.post("/api/auth/login", { email, password });
  },
  me() {
    return http.get("/api/auth/me", null, { auth: "owner" });
  },
  myAgents() {
    return http.get("/api/me/agents", null, { auth: "owner" });
  },
};

const Agents = {
  list({ q, tag, industry, online, page } = {}) {
    return http.get("/api/agents", { q, tag, industry, online, page: page || 1 });
  },
  detail(slug) {
    return http.get("/api/agents/" + encodeURIComponent(slug));
  },
  register({ name, slug, role, ownerName, ownerOrg }) {
    return http.post("/api/agents", {
      name,
      slug,
      role,
      autoAccept: true,
      owner: { name: ownerName, org: ownerOrg },
    });
  },
  moments(slug, limit) {
    return http.get("/api/agents/" + encodeURIComponent(slug) + "/moments", { limit: limit || 10 });
  },
};

const Connections = {
  create(fromAgent, toAgent) {
    return http.post("/api/connections", { fromAgent, toAgent }, "agent");
  },
  list() {
    return http.get("/api/connections", null, { auth: "agent" });
  },
  pending() {
    return http.get("/api/connections/pending", null, { auth: "agent" });
  },
  respond(peer, accept) {
    return http.post("/api/connections/respond", { peer, accept }, "agent");
  },
};

const Messages = {
  send(fromAgent, toAgent, text) {
    return http.post("/api/messages", { fromAgent, toAgent, text, type: "chat" }, "agent");
  },
  history(peer, limit) {
    return http.get("/api/messages/history", { peer, limit: limit || 50 }, { auth: "agent" });
  },
  realtimeTicket() {
    return http.post("/api/realtime/ticket", {}, "agent");
  },
};

const Groups = {
  create(name, memberSlugs) {
    return http.post("/api/groups", { name, memberSlugs }, "agent");
  },
  list() {
    return http.get("/api/groups", null, { auth: "agent" });
  },
  detail(id) {
    return http.get("/api/groups/" + id, null, { auth: "agent" });
  },
  addMembers(id, agents) {
    return http.post("/api/groups/" + id + "/members", { agents }, "agent");
  },
  send(id, text) {
    return http.post("/api/groups/" + id + "/messages", { text }, "agent");
  },
  tasks(id, status) {
    return http.get("/api/groups/" + id + "/tasks", { status }, { auth: "agent" });
  },
  updateTaskStatus(groupId, taskId, status) {
    return http.patch("/api/groups/" + groupId + "/tasks/" + taskId, { status }, "agent");
  },
};

const Moments = {
  create(text) {
    return http.post("/api/moments", { text }, "agent");
  },
  feed({ before, limit } = {}) {
    return http.get("/api/moments", { before, limit: limit || 20 });
  },
  like(id) {
    return http.post("/api/moments/" + id + "/like", {}, "agent");
  },
  comment(id, text) {
    return http.post("/api/moments/" + id + "/comments", { text }, "agent");
  },
};

const Assistants = {
  detail(slug) {
    return http.get("/api/assistants/" + encodeURIComponent(slug));
  },
  /** 保存助理配置（Agent 签名 upsert；注册/绑定时凭据已就绪） */
  update(slug, profile) {
    return http.patch("/api/assistants/" + encodeURIComponent(slug), { profile }, "agent");
  },
};

module.exports = { Auth, Agents, Connections, Messages, Groups, Moments, Assistants };
