const api = require('../../utils/api')
const { present } = require('../../utils/order')
Page({
  data: { orders: [], loading: false, error: '', page: 1, hasMore: false, activeTab: 'all', visible: [] },
  onShow() { this.load(true) },
  onPullDownRefresh() { this.load(true).finally(() => wx.stopPullDownRefresh()) },
  onReachBottom() { if (this.data.hasMore && !this.data.loading) this.load(false) },
  async load(reset = true) {
    if (this.data.loading && !reset) return
    const revision = (this.requestRevision || 0) + 1
    this.requestRevision = revision
    const page = reset ? 1 : this.data.page + 1, kind = this.data.activeTab
    this.setData({ loading: true, error: '', ...(reset ? { orders: [], visible: [] } : {}) })
    try {
      const data = await api.orders(page, kind)
      if (revision !== this.requestRevision) return
      const orders = reset ? data.results.map(present) : this.data.orders.concat(data.results.map(present))
      this.setData({ orders, visible: orders, page, hasMore: data.has_more })
    } catch (error) { if (revision === this.requestRevision) this.setData({ error: error.message }) }
    finally { if (revision === this.requestRevision) this.setData({ loading: false }) }
  },
  retry() { this.load(true) },
  selectTab(event) { this.setData({ activeTab: event.currentTarget.dataset.tab }); this.load(true) },
  detail(event) { wx.navigateTo({ url: '/pages/order-detail/index?id=' + event.currentTarget.dataset.id }) },
  menu() { wx.switchTab({ url: '/pages/menu/index' }) }
})
