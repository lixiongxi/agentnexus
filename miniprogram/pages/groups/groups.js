const api = require("../../utils/api");
const store = require("../../utils/store");

Page({
  data: {
    items: [],
    loading: true,
    error: "",
    showCreate: false,
    newName: "",
    partners: [],
    selected: {},
    selectedCount: 0,
    creating: false,
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
    return api.Groups.list()
      .then((data) => {
        const items = (data.items || []).map((g) => ({
          id: g.id,
          name: g.name,
          memberCount: g.memberCount || 0,
          lastText: g.lastMessage
            ? g.lastMessage.fromAgent + "：" + g.lastMessage.text
            : "暂无消息",
        }));
        this.setData({ items, loading: false });
      })
      .catch((err) => this.setData({ loading: false, error: err.message }));
  },

  goChat(e) {
    wx.navigateTo({
      url: "/pages/group-chat/group-chat?id=" + e.currentTarget.dataset.id +
        "&name=" + encodeURIComponent(e.currentTarget.dataset.name || "群聊"),
    });
  },

  /* ---------- 发起群聊 ---------- */

  openCreate() {
    api.Connections.list()
      .then((data) => {
        const partners = (data.items || []).map((c) => ({
          slug: c.peer.slug,
          name: c.peer.name,
          emoji: c.peer.emoji || "🤖",
        }));
        this.setData({ showCreate: true, partners, selected: {}, selectedCount: 0, newName: "" });
      })
      .catch((err) => wx.showToast({ title: err.message, icon: "none" }));
  },

  closeCreate() {
    this.setData({ showCreate: false });
  },

  onNewName(e) {
    this.setData({ newName: e.detail.value });
  },

  toggleMember(e) {
    const slug = e.currentTarget.dataset.slug;
    const selected = Object.assign({}, this.data.selected);
    if (selected[slug]) delete selected[slug];
    else selected[slug] = true;
    this.setData({ selected, selectedCount: Object.keys(selected).length });
  },

  createGroup() {
    const name = (this.data.newName || "").trim();
    if (!name) return wx.showToast({ title: "请填写群名称", icon: "none" });
    if (this.data.creating) return;
    this.setData({ creating: true });
    const slugs = Object.keys(this.data.selected);
    api.Groups.create(name, slugs)
      .then((data) => {
        this.setData({ creating: false, showCreate: false });
        wx.showToast({ title: "群创建成功", icon: "success" });
        wx.navigateTo({
          url: "/pages/group-chat/group-chat?id=" + data.id + "&name=" + encodeURIComponent(name),
        });
      })
      .catch((err) => {
        this.setData({ creating: false });
        wx.showToast({ title: err.message, icon: "none" });
      });
  },
});
