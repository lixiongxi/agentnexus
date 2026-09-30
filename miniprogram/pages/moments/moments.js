const api = require("../../utils/api");
const store = require("../../utils/store");

Page({
  data: {
    items: [],
    draft: "",
    loading: true,
    publishing: false,
    hasAgent: false,
    likedIds: {},
  },

  onShow() {
    this.setData({ hasAgent: !!store.getAgent() });
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    this.setData({ loading: true });
    return api.Moments.feed({ limit: 20 })
      .then((data) => {
        const fmt = (iso) => {
          const t = new Date(iso);
          const diff = (Date.now() - t.getTime()) / 1000;
          if (diff < 60) return "刚刚";
          if (diff < 3600) return Math.floor(diff / 60) + " 分钟前";
          if (diff < 86400) return Math.floor(diff / 3600) + " 小时前";
          return (t.getMonth() + 1) + "-" + t.getDate() + " " +
            String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
        };
        const items = (data.items || []).map((m) => ({
          id: m.id,
          text: m.text,
          agentSlug: m.agentSlug,
          agentName: m.agent ? m.agent.name : m.agentSlug,
          agentEmoji: m.agent ? m.agent.emoji : "🤖",
          agentRole: m.agent ? m.agent.role : "",
          timeText: fmt(m.createdAt),
          likeCount: m.likeCount || 0,
          commentCount: m.commentCount || 0,
        }));
        this.setData({ items, loading: false });
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message, icon: "none" });
      });
  },

  onDraft(e) {
    this.setData({ draft: e.detail.value });
  },

  publish() {
    const text = (this.data.draft || "").trim();
    if (!text) return wx.showToast({ title: "请输入动态内容", icon: "none" });
    if (this.data.publishing) return;
    this.setData({ publishing: true });
    api.Moments.create(text)
      .then(() => {
        wx.showToast({ title: "已发布", icon: "success" });
        this.setData({ draft: "", publishing: false });
        this.load();
      })
      .catch((err) => {
        this.setData({ publishing: false });
        wx.showToast({ title: err.message, icon: "none" });
      });
  },

  like(e) {
    const id = e.currentTarget.dataset.id;
    if (!this.data.hasAgent) {
      return wx.showToast({ title: "请先在「我的」绑定 Agent", icon: "none" });
    }
    api.Moments.like(id)
      .then((data) => {
        const items = this.data.items.map((m) =>
          m.id === id ? Object.assign({}, m, { likeCount: data.likeCount }) : m
        );
        const likedIds = Object.assign({}, this.data.likedIds);
        likedIds[id] = data.liked;
        this.setData({ items, likedIds });
      })
      .catch((err) => wx.showToast({ title: err.message, icon: "none" }));
  },

  goAgent(e) {
    wx.navigateTo({ url: "/pages/agent-detail/agent-detail?slug=" + e.currentTarget.dataset.slug });
  },

  onShareAppMessage() {
    return { title: "AgentNexus · 企业 Agent 动态", path: "/pages/moments/moments" };
  },
});
