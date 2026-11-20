const api = require('../../utils/api')
const cart = require('../../utils/cart')
const pendingKey = 'slow_isle_pending_order'
Page({
  data: { loading: true, error: '', store: null, items: [], count: 0, total: '0.00', customerName: '', note: '', submitting: false, pending: false, stockBlocked: false,
    pickupMode: 'asap', pickupRequired: false, pickupSlots: [], pickupIndex: 0, pickupLabel: '', leadMinutes: 0 },
  onLoad() {
    const pending = wx.getStorageSync(pendingKey)
    if (pending && pending.payload && Array.isArray(pending.items)) {
      this.pendingSubmission = pending
      this.setData({ pending: true, customerName: pending.payload.customer_name, note: pending.payload.note })
    }
    this.load()
  },
  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const catalog = await getApp().getCatalog(true)
      if (!this.pendingSubmission && getApp().refreshCart(catalog.products)) wx.showToast({ title: '商品有更新，请重新确认', icon: 'none' })
      const items = this.pendingSubmission ? this.pendingSubmission.items : getApp().globalData.cart
      const stockBlocked = !this.pendingSubmission && items.some(item => !cart.canOrder(item))
      this.setData({ store: catalog.store, items, stockBlocked, ...cart.totals(items) })
      if (this.pendingSubmission) {
        this.setData({ pickupMode: this.pendingSubmission.payload.scheduled_for ? 'scheduled' : 'asap',
          pickupLabel: this.pendingSubmission.pickupLabel || '原预约时段（正在确认）' })
      } else if (stockBlocked) {
        this.setData({ pickupSlots: [], pickupLabel: '' })
      } else if (items.length) {
        const options = await api.pickupSlots(items.map(item => item.product_id))
        const previous = this.data.pickupSlots[this.data.pickupIndex]
        const pickupIndex = Math.max(0, options.slots.findIndex(slot => previous && slot.value === previous.value))
        this.setData({ pickupRequired: options.required, pickupMode: options.required ? 'scheduled' : this.data.pickupMode,
          pickupSlots: options.slots, pickupIndex, pickupLabel: options.slots[pickupIndex] ? options.slots[pickupIndex].label : '', leadMinutes: options.lead_minutes })
      }
    } catch (error) { this.setData({ error: error.message }) }
    finally { this.setData({ loading: false }) }
  },
  retry() { this.load() },
  nameInput(event) { if (!this.data.pending) this.setData({ customerName: event.detail.value }) },
  noteInput(event) { if (!this.data.pending) this.setData({ note: event.detail.value }) },
  changePickupMode(event) {
    if (this.data.pending) return
    const mode = event.currentTarget.dataset.mode
    if (mode === 'asap' && this.data.pickupRequired) return
    if (mode === 'scheduled' && !this.data.pickupSlots.length) { wx.showToast({ title: '未来24小时暂无可约时段', icon: 'none' }); return }
    this.setData({ pickupMode: mode })
  },
  selectPickup(event) {
    if (this.data.pending) return
    const pickupIndex = Number(event.detail.value), slot = this.data.pickupSlots[pickupIndex]
    if (slot) this.setData({ pickupIndex, pickupLabel: slot.label })
  },
  async submit() {
    if (this.data.submitting || !this.data.items.length) return
    if (!this.pendingSubmission && this.data.stockBlocked) { wx.showToast({ title: '请先移除购物袋中的缺货商品', icon: 'none' }); return }
    if (!this.pendingSubmission && !this.data.store.is_open) { wx.showToast({ title: '门店暂未接受点单', icon: 'none' }); return }
    if (!this.pendingSubmission && this.data.pickupMode === 'scheduled' && !this.data.pickupSlots[this.data.pickupIndex]) { wx.showToast({ title: '请选择可用的预约时段', icon: 'none' }); return }
    if (!this.pendingSubmission) {
      const items = JSON.parse(JSON.stringify(this.data.items))
      const payload = { request_id: cart.requestId(), customer_name: this.data.customerName.trim(), note: this.data.note.trim(), expected_total: this.data.total,
        scheduled_for: this.data.pickupMode === 'scheduled' ? this.data.pickupSlots[this.data.pickupIndex].value : null,
        items: items.map(item => ({ product_id: item.product_id, quantity: item.quantity, options: item.options })) }
      this.pendingSubmission = { payload, items, pickupLabel: this.data.pickupLabel }
      wx.setStorageSync(pendingKey, this.pendingSubmission)
    }
    this.setData({ submitting: true, pending: true })
    try {
      const order = await api.createOrder(this.pendingSubmission.payload)
      // Preserve items added after a previous request whose response was lost.
      let remaining = getApp().globalData.cart.map(item => ({ ...item }))
      this.pendingSubmission.items.forEach(purchased => {
        const item = remaining.find(line => line.key === purchased.key)
        if (item) item.quantity = Math.max(0, item.quantity - purchased.quantity)
      })
      remaining = remaining.filter(item => item.quantity > 0).map(item => ({ ...item, subtotal: cart.money(item.unitCents * item.quantity) }))
      getApp().setCart(remaining)
      wx.removeStorageSync(pendingKey); this.pendingSubmission = null
      wx.redirectTo({ url: '/pages/order-detail/index?id=' + order.id + '&created=1' })
    } catch (error) {
      if (error.status >= 400 && error.status < 500 && error.status !== 401) {
        wx.removeStorageSync(pendingKey); this.pendingSubmission = null; this.setData({ pending: false })
        await this.load()
      }
      wx.showModal({ title: '暂未完成', content: error.message + (this.pendingSubmission ? ' 重试将确认同一笔订单，不会重复下单。' : ''), showCancel: false, confirmColor: '#70533b' })
    } finally { this.setData({ submitting: false }) }
  },
  menu() { wx.switchTab({ url: '/pages/menu/index' }) }
})
