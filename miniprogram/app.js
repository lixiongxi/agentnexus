/**
 * 应用入口：初始化全局状态与实时通道管理
 */
const store = require("./utils/store");
const api = require("./utils/api");
const http = require("./utils/request");

App({
  globalData: {
    agentSlug: "",
    owner: null,
    wsStatus: "offline",
    wsTask: null,
    messageListeners: [],
    groupMessageListeners: [],
  },

  onLaunch() {
    const cred = store.getAgent();
    this.globalData.agentSlug = cred ? cred.slug : "";
    this.globalData.owner = store.getOwnerProfile();
  },

  /** 绑定 Agent 后调用 */
  refreshAgent() {
    const cred = store.getAgent();
    this.globalData.agentSlug = cred ? cred.slug : "";
  },

  /* ---------------- 实时通道 ---------------- */

  /** 打开 WebSocket（票据换取），断线 3s 后重连 */
  ensureWs() {
    const g = this.globalData;
    if (g.wsTask || !store.getAgent()) return;
    api.Messages.realtimeTicket()
      .then((data) => {
        const task = wx.connectSocket({ url: http.realtimeWsUrl(data.ticket) });
        g.wsTask = task;
        task.onOpen(() => {
          g.wsStatus = "online";
          this.notifyStatus();
        });
        task.onMessage((res) => {
          let msg;
          try {
            msg = JSON.parse(res.data);
          } catch (e) {
            return;
          }
          if (msg.type === "message" && msg.payload) {
            g.messageListeners.forEach((cb) => cb(msg.payload));
          } else if (msg.type === "group-message" && msg.payload) {
            g.groupMessageListeners.forEach((cb) => cb(msg.payload));
          }
        });
        task.onClose(() => this.onWsClosed());
        task.onError(() => this.onWsClosed());
      })
      .catch(() => this.onWsClosed());
  },

  onWsClosed() {
    const g = this.globalData;
    g.wsTask = null;
    g.wsStatus = "offline";
    this.notifyStatus();
    if (g.wsRetry) return;
    g.wsRetry = setTimeout(() => {
      g.wsRetry = null;
      if (g.messageListeners.length || g.groupMessageListeners.length) this.ensureWs();
    }, 3000);
  },

  closeWs() {
    const g = this.globalData;
    if (g.wsTask) {
      g.wsTask.close({});
      g.wsTask = null;
    }
    g.wsStatus = "offline";
  },

  /** 订阅单聊实时消息，返回取消函数 */
  subscribeMessages(cb) {
    const g = this.globalData;
    g.messageListeners.push(cb);
    this.ensureWs();
    return () => {
      g.messageListeners = g.messageListeners.filter((x) => x !== cb);
    };
  },

  /** 订阅群消息，返回取消函数 */
  subscribeGroupMessages(cb) {
    const g = this.globalData;
    g.groupMessageListeners.push(cb);
    this.ensureWs();
    return () => {
      g.groupMessageListeners = g.groupMessageListeners.filter((x) => x !== cb);
    };
  },

  statusListeners: [],
  notifyStatus() {
    const g = this.globalData;
    this.statusListeners.forEach((cb) => cb(g.wsStatus));
  },
  onWsStatus(cb) {
    this.statusListeners.push(cb);
    return () => {
      this.statusListeners = this.statusListeners.filter((x) => x !== cb);
    };
  },
});
