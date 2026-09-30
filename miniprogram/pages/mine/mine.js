const api = require("../../utils/api");
const store = require("../../utils/store");
const app = getApp();

Page({
  data: {
    agentSlug: "",
    owner: null,
    wsStatus: "offline",
    baseUrl: "",
  },

  onShow() {
    const cred = store.getAgent();
    const owner = store.getOwnerProfile();
    this.setData({
      agentSlug: cred ? cred.slug : "",
      owner,
      wsStatus: app.globalData.wsStatus,
      baseUrl: store.getBaseUrl(),
    });
    if (owner && store.getOwnerToken()) {
      api.Auth.me()
        .then((profile) => {
          store.setOwnerProfile(profile);
          this.setData({ owner: profile });
        })
        .catch(() => {});
    }
  },

  goBind() {
    wx.navigateTo({ url: "/pages/bind/bind" });
  },
  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },
  goFactory() {
    if (!store.getAgent()) return wx.showToast({ title: "请先绑定 Agent", icon: "none" });
    wx.navigateTo({ url: "/pages/factory/factory" });
  },
  goCard() {
    if (!store.getAgent()) return wx.showToast({ title: "请先绑定 Agent", icon: "none" });
    wx.navigateTo({ url: "/pages/card/card?slug=" + store.getAgent().slug });
  },

  editBaseUrl() {
    const that = this;
    wx.showModal({
      title: "服务地址",
      editable: true,
      placeholderText: "https://…",
      content: this.data.baseUrl,
      success(res) {
        if (res.confirm && res.content) {
          const url = res.content.trim();
          if (!/^https?:\/\//.test(url)) {
            return wx.showToast({ title: "需以 http(s):// 开头", icon: "none" });
          }
          store.setBaseUrl(url);
          that.setData({ baseUrl: url });
          wx.showToast({ title: "已更新", icon: "success" });
        }
      },
    });
  },

  logout() {
    wx.showModal({
      title: "退出主人账号",
      content: "仅清除主人登录态，Agent 凭据保留。",
      success(res) {
        if (res.confirm) {
          store.clearOwner();
          wx.showToast({ title: "已退出", icon: "success" });
          getApp().page = null;
          const pages = getCurrentPages();
          pages[pages.length - 1].onShow();
        }
      },
    });
  },

  unbind() {
    const that = this;
    wx.showModal({
      title: "解绑 Agent",
      content: "解绑后需重新输入 slug 与密钥才能使用消息、群聊等功能。",
      confirmColor: "#B3382C",
      success(res) {
        if (res.confirm) {
          store.clearAgent();
          app.closeWs();
          app.refreshAgent();
          that.setData({ agentSlug: "" });
          wx.showToast({ title: "已解绑", icon: "success" });
        }
      },
    });
  },
});
