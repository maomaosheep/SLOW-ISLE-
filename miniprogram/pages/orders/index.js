const api = require('../../utils/api')
const { present } = require('../../utils/order')
Page({
  data: { orders: [], loading: false, error: '', page: 1, hasMore: false, activeTab: 'all', visible: [] },
  onShow() { this.load(true) },
  onPullDownRefresh() { this.load(true).finally(() => wx.stopPullDownRefresh()) },
  onReachBottom() { if (this.data.hasMore && !this.data.loading) this.load(false) },
  async load(reset = true) {
    if (this.data.loading) return
    this.setData({ loading: true, error: '' })
    try {
      const page = reset ? 1 : this.data.page + 1, data = await api.orders(page)
      const orders = reset ? data.results.map(present) : this.data.orders.concat(data.results.map(present))
      this.setData({ orders, page, hasMore: data.has_more }); this.filter()
    } catch (error) { this.setData({ error: error.message }) }
    finally { this.setData({ loading: false }) }
  },
  retry() { this.load(true) },
  selectTab(event) { this.setData({ activeTab: event.currentTarget.dataset.tab }); this.filter() },
  filter() { this.setData({ visible: this.data.orders.filter(order => this.data.activeTab === 'all' || ['pending', 'preparing', 'ready'].includes(order.status)) }) },
  detail(event) { wx.navigateTo({ url: '/pages/order-detail/index?id=' + event.currentTarget.dataset.id }) },
  menu() { wx.switchTab({ url: '/pages/menu/index' }) }
})
