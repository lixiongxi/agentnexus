const api = require("../../utils/api");
const store = require("../../utils/store");
const app = getApp();

Page({
  data: {
    groupId: "",
    groupName: "",
    tab: "chat", // chat | tasks
    members: [],
    items: [],
    tasks: [],
    text: "",
    loading: true,
    error: "",
    sending: false,
    mySlug: "",
    scrollInto: "",
  },

  onLoad(options) {
    const cred = store.getAgent();
    this.setData({
      groupId: options.id || "",
      groupName: decodeURIComponent(options.name || "群聊"),
      mySlug: cred ? cred.slug : "",
    });
    wx.setNavigationBarTitle({ title: this.data.groupName });
    this.load();
    this.unsub = app.subscribeGroupMessages((msg) => this.onIncoming(msg));
  },

  onUnload() {
    if (this.unsub) this.unsub();
  },

  load() {
    this.setData({ loading: true, error: "" });
    return api.Groups.detail(this.data.groupId)
      .then((d) => {
        const members = (d.members || []).map((m) => ({
          slug: m.agentSlug,
          name: m.name || m.agentSlug,
          emoji: m.emoji || "🤖",
          isCreator: m.isCreator,
        }));
        const memberMap = {};
        members.forEach((m) => (memberMap[m.slug] = m));
        const items = (d.messages || []).map((m) => this.toView(m, memberMap));
        this.setData({ members, items, loading: false });
        this.scrollBottom(items);
        this.loadTasks(memberMap);
      })
      .catch((err) => this.setData({ loading: false, error: err.message }));
  },

  loadTasks(providedMap) {
    const memberMap =
      providedMap ||
      this.data.members.reduce((acc, m) => ((acc[m.slug] = m), acc), {});
    api.Groups.tasks(this.data.groupId)
      .then((data) => {
        const tasks = (data.tasks || []).map((t) => {
          const who = memberMap[t.assigneeSlug] || {};
          return {
            id: t.id,
            taskCode: t.taskCode,
            title: t.title,
            status: t.status,
            statusText: { open: "待处理", working: "进行中", done: "已完成", failed: "已失败" }[t.status] || t.status,
            pillClass: "pill-" + t.status,
            assigneeSlug: t.assigneeSlug,
            assigneeName: who.name || t.assigneeSlug,
            creatorSlug: t.creatorSlug,
            canOperate:
              this.data.mySlug === t.creatorSlug || this.data.mySlug === t.assigneeSlug,
            next: { open: ["working", "done", "failed"], working: ["done", "failed"], done: [], failed: [] }[t.status] || [],
          };
        });
        this.setData({ tasks });
      })
      .catch(() => {});
  },

  toView(m, memberMap) {
    const map = memberMap || this.data.members.reduce((acc, x) => ((acc[x.slug] = x), acc), {});
    const who = map[m.fromAgent] || {};
    const t = new Date(m.createdAt);
    return {
      id: m.id,
      anchor: "g" + m.id,
      text: m.text,
      fromAgent: m.fromAgent,
      fromName: who.name || m.fromAgent,
      fromEmoji: who.emoji || "🤖",
      mine: m.fromAgent === this.data.mySlug,
      isBot: m.type === "bot",
      timeText: String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0"),
    };
  },

  onIncoming(msg) {
    if (msg.groupId !== this.data.groupId) return;
    if (this.data.items.some((x) => x.id === msg.id)) return;
    const items = this.data.items.concat([this.toView(msg)]);
    this.setData({ items });
    this.scrollBottom(items);
    if (msg.type === "bot" && msg.text.indexOf("TSK-") >= 0) this.loadTasks();
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ tab });
    if (tab === "tasks") this.loadTasks();
  },

  onInput(e) {
    this.setData({ text: e.detail.value });
  },

  send() {
    const text = (this.data.text || "").trim();
    if (!text || this.data.sending) return;
    this.setData({ sending: true });
    api.Groups.send(this.data.groupId, text)
      .then((msg) => {
        const items = this.data.items.concat(
          this.data.items.some((x) => x.id === msg.id) ? [] : [this.toView(msg)]
        );
        this.setData({ items, text: "", sending: false });
        this.scrollBottom(items);
      })
      .catch((err) => {
        this.setData({ sending: false });
        wx.showToast({ title: err.message, icon: "none" });
      });
  },

  /** 任务状态流转 */
  flow(e) {
    const { id, status } = e.currentTarget.dataset;
    api.Groups.updateTaskStatus(this.data.groupId, id, status)
      .then((t) => {
        wx.showToast({ title: t.taskCode + " → " + t.status, icon: "success" });
        this.loadTasks();
      })
      .catch((err) => wx.showToast({ title: err.message, icon: "none" }));
  },

  goMembers() {
    const names = this.data.members
      .map((m) => m.emoji + " " + m.name + (m.isCreator ? "（群主）" : ""))
      .join("\n");
    wx.showModal({
      title: "群成员（" + this.data.members.length + "）",
      content: names || "暂无成员",
      showCancel: false,
    });
  },

  scrollBottom(items) {
    const last = (items || this.data.items).slice(-1)[0];
    if (last) this.setData({ scrollInto: last.anchor });
  },
});
