const api = require('./utils/api')
const cart = require('./utils/cart')

App({
  globalData: { catalog: null, cart: [], catalogRequest: null },
  onLaunch() {
    try {
      const saved = wx.getStorageSync('slow_isle_cart')
      this.globalData.cart = Array.isArray(saved) ? saved.filter(item => item && Number.isInteger(item.product_id) && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 20 && Number.isFinite(item.unitCents)) : []
    } catch (_) { this.globalData.cart = [] }
    this.updateBadge()
  },
  getCatalog(refresh = false) {
    if (!refresh && this.globalData.catalog) return Promise.resolve(this.globalData.catalog)
    if (this.globalData.catalogRequest) return this.globalData.catalogRequest
    this.globalData.catalogRequest = api.catalog().then(data => {
      this.globalData.catalog = data
      return data
    }).finally(() => { this.globalData.catalogRequest = null })
    return this.globalData.catalogRequest
  },
  setCart(items) {
    this.globalData.cart = items
    wx.setStorageSync('slow_isle_cart', items)
    this.updateBadge()
  },
  updateBadge() {
    const count = cart.totals(this.globalData.cart).count
    if (count) wx.setTabBarBadge({ index: 1, text: String(count), fail() {} })
    else wx.removeTabBarBadge({ index: 1, fail() {} })
  },
  addToCart(product, options, quantity) {
    const line = cart.lineFor(product, options, quantity)
    this.setCart(cart.add(this.globalData.cart, line))
  },
  refreshCart(products) {
    const result = cart.reconcile(this.globalData.cart, products)
    this.setCart(result.items)
    return result.changed
  }
})
