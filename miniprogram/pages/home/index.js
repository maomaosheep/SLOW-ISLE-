const { chooseCoffee } = require('../../utils/recommendations')
Page({
  data: { loading: true, error: '', store: null, featured: null, recommendations: [] },
  onLoad() { this.load() },
  onShow() { if (this.data.store) this.load(true) },
  onPullDownRefresh() { this.load(true).finally(() => wx.stopPullDownRefresh()) },
  async load(refresh = false) {
    this.setData({ loading: true, error: '' })
    try {
      const catalog = await getApp().getCatalog(refresh)
      this.setData({ store: catalog.store, featured: catalog.products.find(item => item.is_featured) || catalog.products[0] || null })
      this.catalog = catalog
      this.shuffleRecommendations()
    } catch (error) { this.setData({ error: error.message }) }
    finally { this.setData({ loading: false }) }
  },
  retry() { this.load(true) },
  orderNow() { wx.switchTab({ url: '/pages/menu/index' }) },
  shuffleRecommendations() {
    if (!this.catalog) return
    this.setData({ recommendations: chooseCoffee(this.catalog.products, this.catalog.categories, this.data.recommendations.map(p => p.id)) })
  },
  choose(event) { wx.navigateTo({ url: '/pages/detail/index?id=' + event.currentTarget.dataset.id }) },
  showFeatured() { if (this.data.featured) wx.navigateTo({ url: '/pages/detail/index?id=' + this.data.featured.id }) }
})
