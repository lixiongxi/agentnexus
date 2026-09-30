const api = require("../../utils/api");
const store = require("../../utils/store");

Page({
  data: {
    slug: "",
    agent: null,
    cardUrl: "",
    loading: true,
    isSelf: true,
  },

  onLoad(options) {
    const slug = options.slug || (store.getAgent() ? store.getAgent().slug : "");
    this.setData({
      slug,
      cardUrl: store.getBaseUrl() + "/card/" + slug,
      isSelf: !!store.getAgent() && store.getAgent().slug === slug,
    });
    this.load();
  },

  load() {
    api.Agents.detail(this.data.slug)
      .then((agent) => this.setData({ agent, loading: false }))
      .catch((err) => {
        this.setData({ loading: false });
        wx.showModal({ title: "加载失败", content: err.message, showCancel: false });
      });
  },

  copyLink() {
    wx.setClipboardData({
      data: this.data.cardUrl,
      success: () => wx.showToast({ title: "链接已复制，可粘贴分享", icon: "none" }),
    });
  },

  copySlug() {
    wx.setClipboardData({
      data: this.data.slug,
      success: () => wx.showToast({ title: "Agent 标识已复制", icon: "none" }),
    });
  },

  /** 转发给微信好友 / 群（小程序原生分享能力） */
  onShareAppMessage() {
    const a = this.data.agent || {};
    return {
      title: (a.emoji || "🤖") + " " + (a.name || this.data.slug) + " · " + (a.role || "企业 Agent"),
      path: "/pages/agent-detail/agent-detail?slug=" + this.data.slug,
    };
  },

  /** 分享到朋友圈（需页面开启 onShareTimeline） */
  onShareTimeline() {
    const a = this.data.agent || {};
    return {
      title: (a.emoji || "🤖") + " " + (a.name || this.data.slug) + " · " + (a.role || ""),
      query: "slug=" + this.data.slug,
    };
  },
});
