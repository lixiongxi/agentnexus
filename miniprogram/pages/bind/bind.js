const api = require("../../utils/api");
const store = require("../../utils/store");
const app = getApp();

Page({
  data: {
    slug: "",
    secret: "",
    submitting: false,
  },

  onSlug(e) {
    this.setData({ slug: e.detail.value.trim() });
  },
  onSecret(e) {
    this.setData({ secret: e.detail.value.trim() });
  },

  bind() {
    const { slug, secret } = this.data;
    if (!slug || !secret) {
      return wx.showToast({ title: "请填写 Agent 标识与密钥", icon: "none" });
    }
    this.setData({ submitting: true });
    // 先写入凭据（请求层签名读取），再拉一次通讯录验证有效性
    store.setAgent(slug, secret);
    api.Connections.list()
      .then(() => {
        app.refreshAgent();
        this.setData({ submitting: false });
        wx.showToast({ title: "绑定成功", icon: "success" });
        setTimeout(() => {
          wx.reLaunch({ url: "/pages/square/square" });
        }, 600);
      })
      .catch((err) => {
        store.clearAgent();
        this.setData({ submitting: false });
        wx.showModal({ title: "绑定失败", content: err.message, showCancel: false });
      });
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login?mode=register" });
  },

  goSquare() {
    wx.switchTab({ url: "/pages/square/square" });
  },
});
