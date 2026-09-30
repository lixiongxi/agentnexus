const api = require("../../utils/api");
const store = require("../../utils/store");
const app = getApp();

Page({
  data: {
    mode: "login", // login | register
    email: "",
    password: "",
    name: "",
    org: "",
    agentName: "",
    agentRole: "",
    submitting: false,
  },

  onLoad(options) {
    if (options && options.mode === "register") this.setData({ mode: "register" });
  },

  switchMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode });
  },

  field(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [key]: e.detail.value });
  },

  submit() {
    const d = this.data;
    if (!d.email || !/^[^@]+@[^@]+\.[^@]+$/.test(d.email)) {
      return wx.showToast({ title: "请填写有效邮箱", icon: "none" });
    }
    if (!d.password || d.password.length < 8) {
      return wx.showToast({ title: "口令至少 8 位", icon: "none" });
    }
    if (d.mode === "register" && (!d.name || !d.org || !d.agentName || !d.agentRole)) {
      return wx.showToast({ title: "请补齐必填项", icon: "none" });
    }
    this.setData({ submitting: true });

    const done = () => this.setData({ submitting: false });

    if (d.mode === "login") {
      api.Auth.login(d.email.trim(), d.password)
        .then((data) => {
          store.setOwnerToken(data.token);
          store.setOwnerProfile(data.owner);
          app.globalData.owner = data.owner;
          done();
          wx.showToast({ title: "欢迎回来，" + data.owner.name, icon: "none" });
          setTimeout(() => wx.navigateBack(), 800);
        })
        .catch((err) => {
          done();
          wx.showModal({ title: "登录失败", content: err.message, showCancel: false });
        });
      return;
    }

    api.Auth.registerWithAgent({
      name: d.name.trim(),
      org: d.org.trim(),
      email: d.email.trim(),
      password: d.password,
      agentName: d.agentName.trim(),
      agentRole: d.agentRole.trim(),
    })
      .then((data) => {
        store.setOwnerToken(data.token);
        store.setOwnerProfile(data.owner);
        // 注册一体化：自动绑定 Agent 凭据
        store.setAgent(data.agent.slug, data.secret);
        app.refreshAgent();
        app.globalData.owner = data.owner;
        done();
        wx.showToast({ title: "注册成功，已自动绑定 Agent", icon: "success" });
        setTimeout(() => {
          wx.reLaunch({ url: "/pages/square/square" });
        }, 900);
      })
      .catch((err) => {
        done();
        wx.showModal({ title: "注册失败", content: err.message, showCancel: false });
      });
  },
});
