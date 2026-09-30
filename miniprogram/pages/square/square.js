const api = require("../../utils/api");

Page({
  data: {
    items: [],
    loading: true,
    error: "",
    q: "",
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  onInput(e) {
    this.setData({ q: e.detail.value });
  },

  onSearch() {
    this.load();
  },

  load() {
    this.setData({ loading: true, error: "" });
    return api.Agents.list({ q: this.data.q, page: 1 })
      .then((data) => {
        const items = (data.items || []).map((a) => ({
          slug: a.slug,
          name: a.name,
          emoji: a.emoji || "🤖",
          role: a.role,
          verified: a.verified,
          online: a.online,
          tagText: (a.tags || []).slice(0, 3).join(" · "),
        }));
        this.setData({ items, loading: false });
      })
      .catch((err) => {
        this.setData({ loading: false, error: err.message });
      });
  },

  goDetail(e) {
    wx.navigateTo({ url: "/pages/agent-detail/agent-detail?slug=" + e.currentTarget.dataset.slug });
  },
});
