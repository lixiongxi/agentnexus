const api = require("../../utils/api");
const store = require("../../utils/store");

Page({
  data: {
    slug: "",
    capabilities: { secretary: true, sales: true, ticket: true },
    faq: [],
    products: [],
    loading: true,
    saving: false,
  },

  onLoad() {
    const cred = store.getAgent();
    if (!cred) {
      wx.redirectTo({ url: "/pages/bind/bind" });
      return;
    }
    this.setData({ slug: cred.slug });
    this.load();
  },

  load() {
    api.Assistants.detail(this.data.slug)
      .then((data) => {
        const profile = data.profile || {};
        this.setData({
          capabilities: Object.assign({ secretary: true, sales: true, ticket: true }, profile.capabilities || {}),
          faq: (profile.faq || []).map((f) => ({
            keywordsText: (f.keywords || []).join(", "),
            answer: f.answer || "",
          })),
          products: (profile.products || []).map((p) => ({
            name: p.name || "",
            keywordsText: (p.keywords || []).join(", "),
            pitch: p.pitch || "",
            priceRange: p.priceRange || "",
            followup: p.followup || "",
          })),
          loading: false,
        });
      })
      .catch(() => {
        // 未配置过：保留空表单
        this.setData({ loading: false, faq: [], products: [] });
      });
  },

  toggleCap(e) {
    const key = e.currentTarget.dataset.key;
    const capabilities = Object.assign({}, this.data.capabilities);
    capabilities[key] = !capabilities[key];
    this.setData({ capabilities });
  },

  addFaq() {
    this.setData({ faq: this.data.faq.concat([{ keywordsText: "", answer: "" }]) });
  },
  removeFaq(e) {
    const i = e.currentTarget.dataset.index;
    const faq = this.data.faq.slice();
    faq.splice(i, 1);
    this.setData({ faq });
  },
  onFaqField(e) {
    const { index, key } = e.currentTarget.dataset;
    const faq = this.data.faq.slice();
    faq[index] = Object.assign({}, faq[index], { [key]: e.detail.value });
    this.setData({ faq });
  },

  addProduct() {
    this.setData({
      products: this.data.products.concat([{ name: "", keywordsText: "", pitch: "", priceRange: "", followup: "" }]),
    });
  },
  removeProduct(e) {
    const i = e.currentTarget.dataset.index;
    const products = this.data.products.slice();
    products.splice(i, 1);
    this.setData({ products });
  },
  onProductField(e) {
    const { index, key } = e.currentTarget.dataset;
    const products = this.data.products.slice();
    products[index] = Object.assign({}, products[index], { [key]: e.detail.value });
    this.setData({ products });
  },

  save() {
    if (this.data.saving) return;
    const split = (s) =>
      (s || "")
        .split(/[,，、]/)
        .map((x) => x.trim())
        .filter(Boolean);

    const faq = this.data.faq
      .map((f) => ({ keywords: split(f.keywordsText), answer: (f.answer || "").trim() }))
      .filter((f) => f.keywords.length > 0 && f.answer);

    const products = this.data.products
      .map((p) => ({
        name: (p.name || "").trim(),
        keywords: split(p.keywordsText),
        pitch: p.pitch || "",
        priceRange: p.priceRange || "",
        followup: p.followup || "",
      }))
      .filter((p) => p.name && p.keywords.length > 0);

    this.setData({ saving: true });
    api.Assistants.update(this.data.slug, {
      capabilities: this.data.capabilities,
      faq,
      products,
      secretary: {},
      ticket: {},
      escalate: {},
      fallback: "",
      integrations: {},
    })
      .then(() => {
        this.setData({ saving: false });
        wx.showToast({ title: "配置已保存，即刻生效", icon: "success" });
      })
      .catch((err) => {
        this.setData({ saving: false });
        wx.showModal({ title: "保存失败", content: err.message, showCancel: false });
      });
  },
});
