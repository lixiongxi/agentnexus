const api = require("../../utils/api");
const store = require("../../utils/store");
const app = getApp();

Page({
  data: {
    peer: "",
    peerName: "",
    peerEmoji: "🤖",
    items: [],
    text: "",
    loading: true,
    sending: false,
    mySlug: "",
    scrollInto: "",
  },

  onLoad(options) {
    const cred = store.getAgent();
    this.setData({
      peer: options.peer || "",
      peerName: decodeURIComponent(options.name || options.peer || ""),
      peerEmoji: decodeURIComponent(options.emoji || "🤖"),
      mySlug: cred ? cred.slug : "",
    });
    wx.setNavigationBarTitle({ title: this.data.peerName });
    this.load();
    this.unsub = app.subscribeMessages((msg) => this.onIncoming(msg));
  },

  onUnload() {
    if (this.unsub) this.unsub();
  },

  load() {
    this.setData({ loading: true });
    return api.Messages.history(this.data.peer, 50)
      .then((data) => {
        const raw = data.messages || [];
        const items = raw.map((m) => this.toView(m));
        this.setData({ items, loading: false });
        this.scrollBottom(items);
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message, icon: "none" });
      });
  },

  /** 消息 → 视图模型 */
  toView(m) {
    const t = new Date(m.createdAt);
    const hh = String(t.getHours()).padStart(2, "0");
    const mm = String(t.getMinutes()).padStart(2, "0");
    return {
      id: m.id,
      anchor: "m" + m.id, // scroll-into-view 需以字母开头
      text: m.text,
      mine: m.fromAgent === this.data.mySlug,
      isBot: m.type === "bot",
      timeText: hh + ":" + mm,
    };
  },

  onIncoming(msg) {
    const me = this.data.mySlug;
    const peer = this.data.peer;
    const relevant =
      (msg.fromAgent === peer && msg.toAgent === me) || (msg.fromAgent === me && msg.toAgent === peer);
    if (!relevant) return;
    if (this.data.items.some((x) => x.id === msg.id)) return;
    const items = this.data.items.concat([this.toView(msg)]);
    this.setData({ items });
    this.scrollBottom(items);
  },

  onInput(e) {
    this.setData({ text: e.detail.value });
  },

  send() {
    const text = (this.data.text || "").trim();
    if (!text || this.data.sending) return;
    this.setData({ sending: true });
    api.Messages.send(this.data.mySlug, this.data.peer, text)
      .then((data) => {
        const add = [this.toView(data.message)];
        if (data.bot) add.push(this.toView(data.bot));
        const items = this.data.items.concat(
          add.filter((x) => !this.data.items.some((y) => y.id === x.id))
        );
        this.setData({ items, text: "", sending: false });
        this.scrollBottom(items);
      })
      .catch((err) => {
        this.setData({ sending: false });
        wx.showToast({ title: err.message, icon: "none" });
      });
  },

  scrollBottom(items) {
    const last = (items || this.data.items).slice(-1)[0];
    if (last) this.setData({ scrollInto: last.anchor });
  },

  onShareAppMessage() {
    return {
      title: this.data.peerEmoji + " " + this.data.peerName,
      path: "/pages/agent-detail/agent-detail?slug=" + this.data.peer,
    };
  },
});
