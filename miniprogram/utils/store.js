/**
 * 本地凭据存储（wx.storage 封装）
 * 与 Web/移动端一致：Agent（slug + secret）用于请求级签名，ownerToken 用于主人接口。
 */
const K = {
  slug: "agent.slug",
  secret: "agent.secret",
  ownerToken: "owner.token",
  ownerProfile: "owner.profile",
  baseUrl: "app.baseUrl",
};

const CFG = require("./config");

function get(key, def) {
  const v = wx.getStorageSync(key);
  return v === "" || v === undefined ? def : v;
}

module.exports = {
  getAgent() {
    const slug = get(K.slug, "");
    const secret = get(K.secret, "");
    return slug && secret ? { slug, secret } : null;
  },
  setAgent(slug, secret) {
    wx.setStorageSync(K.slug, slug);
    wx.setStorageSync(K.secret, secret);
  },
  clearAgent() {
    wx.removeStorageSync(K.slug);
    wx.removeStorageSync(K.secret);
  },

  getOwnerToken() {
    return get(K.ownerToken, "");
  },
  setOwnerToken(token) {
    wx.setStorageSync(K.ownerToken, token);
  },
  getOwnerProfile() {
    return get(K.ownerProfile, null);
  },
  setOwnerProfile(profile) {
    wx.setStorageSync(K.ownerProfile, profile);
  },
  clearOwner() {
    wx.removeStorageSync(K.ownerToken);
    wx.removeStorageSync(K.ownerProfile);
  },

  getBaseUrl() {
    return get(K.baseUrl, CFG.defaultBaseUrl);
  },
  setBaseUrl(url) {
    wx.setStorageSync(K.baseUrl, url);
  },
};
