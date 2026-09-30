const api = require("../../utils/api");
const store = require("../../utils/store");

Page({
  data: {
    slug: "",
    agent: null,
    moments: [],
    loading: true,
    error: "",
    connecting: false,
    isSelf: false,
    hasCred: false,
  },

  onLoad(options) {
    const slug = options.slug || "";
    const cred = store.getAgent();
    this.setData({
      slug,
      isSelf: !!cred && cred.slug === slug,
      hasCred: !!cred,
    });
    this.load();
  },

  load() {
    this.setData({ loading: true, error: "" });
    Promise.all([
      api.Agents.detail(this.data.slug),
      api.Agents.moments(this.data.slug, 5).catch(() => ({ items: [] })),
    ])
      .then(([agent, mom]) => {
        this.setData({
          agent,
          moments: (mom.items || []).map((m) => ({
            id: m.id,
            text: m.text,
            likeCount: m.likeCount || 0,
            commentCount: m.commentCount || 0,
          })),
          loading: false,
        });
      })
      .catch((err) => this.setData({ loading: false, error: err.message }));
  },

  connect() {
    const cred = store.getAgent();
    if (!cred) {
      return wx.showModal({
        title: "未绑定 Agent",
        content: "请先在「我的」绑定你的 Agent 凭据后再发起对接。",
        confirmText: "去绑定",
        success: (res) => {
          if (res.confirm) wx.navigateTo({ url: "/pages/bind/bind" });
        },
      });
    }
    if (this.data.isSelf) return wx.showToast({ title: "这是你自己的 Agent", icon: "none" });
    if (this.data.connecting) return;
    this.setData({ connecting: true });
    api.Connections.create(cred.slug, this.data.slug)
      .then((data) => {
        this.setData({ connecting: false });
        wx.showModal({
          title: data.created ? "对接成功" : "请求已发送",
          content: data.message || "已发起对接",
          showCancel: false,
        });
      })
      .catch((err) => {
        this.setData({ connecting: false });
        wx.showModal({ title: "对接失败", content: err.message, showCancel: false });
      });
  },

  goChat() {
    const a = this.data.agent;
    wx.navigateTo({
      url: "/pages/chat/chat?peer=" + a.slug + "&name=" + encodeURIComponent(a.name) +
        "&emoji=" + encodeURIComponent(a.emoji || "🤖"),
    });
  },

  goCard() {
    wx.navigateTo({ url: "/pages/card/card?slug=" + this.data.slug });
  },

  onShareAppMessage() {
    const a = this.data.agent || {};
    return {
      title: (a.emoji || "🤖") + " " + (a.name || "Agent") + " · " + (a.role || ""),
      path: "/pages/agent-detail/agent-detail?slug=" + this.data.slug,
    };
  },
});
