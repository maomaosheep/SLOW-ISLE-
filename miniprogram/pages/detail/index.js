const { cents, money, canOrder } = require('../../utils/cart')
const labels = { temperature: '温度', size: '杯型', sweetness: '甜度' }
Page({
  data: { loading: true, error: '', product: null, groups: [], selected: {}, quantity: 1, price: '0.00', isOpen: true, orderable: true },
  onLoad(options) { this.productId = Number(options.id); this.load() },
  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const data = await getApp().getCatalog(true)
      const product = data.products.find(item => item.id === this.productId)
      if (!product) throw new Error('这款商品已下架，去看看其他咖啡吧。')
      const selected = {}, groups = Object.keys(product.options).map(key => {
        selected[key] = product.options[key][0].label
        return { key, title: labels[key], choices: product.options[key].map(item => ({ ...item, extra_label: cents(item.extra) > 0 ? ' +¥' + money(cents(item.extra)) : '' })) }
      })
      this.setData({ product, groups, selected, isOpen: data.store.is_open, orderable: canOrder(product) })
      this.calculate()
    } catch (error) { this.setData({ error: error.message }) }
    finally { this.setData({ loading: false }) }
  },
  retry() { this.load() },
  select(event) {
    const selected = { ...this.data.selected, [event.currentTarget.dataset.group]: event.currentTarget.dataset.label }
    this.setData({ selected }); this.calculate()
  },
  calculate() {
    let price = cents(this.data.product.price)
    Object.keys(this.data.selected).forEach(key => { price += cents(this.data.product.options[key].find(choice => choice.label === this.data.selected[key]).extra || 0) })
    this.setData({ price: money(price) })
  },
  changeQty(event) { this.setData({ quantity: Math.max(1, Math.min(20, this.data.quantity + Number(event.currentTarget.dataset.delta))) }) },
  add() {
    if (!this.data.isOpen || !canOrder(this.data.product)) return
    try {
      getApp().addToCart(this.data.product, this.data.selected, this.data.quantity)
      wx.showToast({ title: '已加入购物袋', icon: 'success' })
      wx.switchTab({ url: '/pages/menu/index' })
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }) }
  },
  backToMenu() { wx.switchTab({ url: '/pages/menu/index' }) }
})
