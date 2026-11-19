const cart = require('../../utils/cart')
Page({
  data: { loading: true, error: '', store: null, categories: [], products: [], visibleProducts: [], categoryId: 0, categoryName: '人气推荐', keyword: '', items: [], count: 0, total: '0.00', bagVisible: false },
  onLoad() { this.load() },
  onShow() { this.syncCart(); if (this.data.store) this.load(true) },
  onPullDownRefresh() { this.load(true).finally(() => wx.stopPullDownRefresh()) },
  async load(refresh = false) {
    this.setData({ loading: true, error: '' })
    try {
      const data = await getApp().getCatalog(refresh)
      if (getApp().refreshCart(data.products)) wx.showToast({ title: '商品有更新，请确认购物袋', icon: 'none' })
      this.setData({ store: data.store, categories: data.categories, products: data.products })
      if (this.data.categoryId && !data.categories.some(item => item.id === this.data.categoryId)) this.setData({ categoryId: 0, categoryName: '人气推荐' })
      this.filter(); this.syncCart()
    } catch (error) { this.setData({ error: error.message }) }
    finally { this.setData({ loading: false }) }
  },
  retry() { this.load(true) },
  selectCategory(event) { this.setData({ categoryId: Number(event.currentTarget.dataset.id), categoryName: event.currentTarget.dataset.name }); this.filter() },
  search(event) { this.setData({ keyword: event.detail.value }); this.filter() },
  filter() {
    const { products, categoryId, keyword } = this.data
    const query = keyword.trim().toLowerCase()
    this.setData({ visibleProducts: products.filter(item => (!categoryId || item.category_id === categoryId) && (item.name + item.english_name).toLowerCase().includes(query)) })
  },
  choose(event) { wx.navigateTo({ url: '/pages/detail/index?id=' + event.currentTarget.dataset.id }) },
  syncCart() { const items = getApp().globalData.cart; this.setData({ items, ...cart.totals(items) }) },
  showBag() { if (!this.data.count) { wx.showToast({ title: '先选一杯喜欢的咖啡吧', icon: 'none' }); return } this.setData({ bagVisible: true }) },
  closeBag() { this.setData({ bagVisible: false }) },
  changeBag(event) {
    const { key, delta } = event.detail
    const items = cart.change(getApp().globalData.cart, key, delta)
    if (items.some(item => item.quantity > 20) || cart.totals(items).count > 50) { wx.showToast({ title: '已达到本单数量上限', icon: 'none' }); return }
    getApp().setCart(items); this.syncCart()
  },
  clearBag() {
    wx.showModal({ title: '清空购物袋？', content: '选好的咖啡将从购物袋移除。', confirmColor: '#70533b', success: result => { if (result.confirm) { getApp().setCart([]); this.syncCart(); this.closeBag() } } })
  },
  checkout() {
    if (!this.data.count) return
    if (!this.data.store.is_open) { wx.showToast({ title: '门店暂未接受点单', icon: 'none' }); return }
    this.closeBag(); wx.navigateTo({ url: '/pages/checkout/index' })
  }
})
