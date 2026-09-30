const api = require("../../utils/api");
const store = require("../../utils/store");

Page({
  data: {
    items: [],
    pending: [],
    loading: true,
    error: "",
    unread: 0,
  },

  onShow() {
    if (!store.getAgent()) {
      wx.redirectTo({ url: "/pages/bind/bind" });
      return;
    }
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    this.setData({ loading: true, error: "" });
    const fmt = (iso) => {
      const t = new Date(iso);
      const diff = (Date.now() - t.getTime()) / 1000;
      if (diff < 60) return "刚刚";
      if (diff < 3600) return Math.floor(diff / 60) + " 分钟前";
      if (diff < 86400) {
        return String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
      }
      return (t.getMonth() + 1) + "-" + t.getDate();
    };

    return Promise.all([api.Connections.list(), api.Connections.pending().catch(() => ({ items: [] }))])
      .then(([conns, pend]) => {
        const items = (conns.items || []).map((c) => ({
          slug: c.peer.slug,
          name: c.peer.name,
          emoji: c.peer.emoji || "🤖",
          verified: c.peer.verified,
          online: c.peer.online,
          lastText: c.last ? c.last.text : "暂无消息",
          lastTime: c.last ? fmt(c.last.createdAt) : "",
          unread: c.unread || 0,
        }));
        const pending = (pend.items || []).map((p) => ({
          slug: p.agent ? p.agent.slug : p.fromAgent,
          name: p.agent ? p.agent.name : p.fromAgent,
          emoji: p.agent ? p.agent.emoji : "🤖",
        }));
        this.setData({
          items,
          pending,
          unread: items.reduce((s, x) => s + x.unread, 0),
          loading: false,
        });
      })
      .catch((err) => this.setData({ loading: false, error: err.message }));
  },

  goChat(e) {
    const { slug, name, emoji } = e.currentTarget.dataset;
    wx.navigateTo({
      url:
        "/pages/chat/chat?peer=" +
        slug +
        "&name=" +
        encodeURIComponent(name) +
        "&emoji=" +
        encodeURIComponent(emoji),
    });
  },

  goGroups() {
    wx.navigateTo({ url: "/pages/groups/groups" });
  },

  /** 处理对接请求 */
  respond(e) {
    const { slug, accept } = e.currentTarget.dataset;
    api.Connections.respond(slug, accept === "1")
      .then(() => {
        wx.showToast({ title: accept === "1" ? "已接受" : "已拒绝", icon: "success" });
        this.load();
      })
      .catch((err) => wx.showToast({ title: err.message, icon: "none" }));
  },
});
