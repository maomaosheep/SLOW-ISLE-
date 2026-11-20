const api = require('../../utils/api')
const { present } = require('../../utils/order')
const progress = { pending: 0, preparing: 1, ready: 2, completed: 3, cancelled: -1 }
const messages = { pending: '门店正在确认你的订单，请稍等片刻。', preparing: '咖啡师正在认真制作，很快就能见面。', ready: '你的咖啡做好了，凭取餐码来吧。', completed: '谢谢你，把片刻留给了慢屿。', cancelled: '本次订单已取消，下次再一起慢下来。' }
Page({
  data: { order: null, loading: true, error: '', statusText: '', step: 0, cancelling: false, created: false },
  onLoad(options) { this.orderId = options.id; this.setData({ created: options.created === '1' }) },
  onShow() { this.active = true; this.load() },
  onHide() { this.active = false; clearTimeout(this.timer) },
  onUnload() { this.active = false; clearTimeout(this.timer) },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },
  async load() {
    clearTimeout(this.timer)
    if (this.fetching) return
    this.fetching = true
    try {
      const order = present(await api.order(this.orderId))
      const statusText = order.scheduled_for && ['pending', 'preparing'].includes(order.status)
        ? '预约 ' + order.pickup_label + ' 取餐，门店将按约定时间备货。' : messages[order.status]
      this.setData({ order, loading: false, error: '', statusText, step: progress[order.status] })
    } catch (error) { this.setData({ loading: false, error: error.message }) }
    finally {
      this.fetching = false
      const status = this.data.order && this.data.order.status
      if (this.active && !['completed', 'cancelled'].includes(status)) this.timer = setTimeout(() => this.load(), 10000)
    }
  },
  retry() { this.load() },
  cancel() {
    if (this.data.cancelling || !this.data.order || this.data.order.status !== 'pending') return
    wx.showModal({ title: '取消这笔订单？', content: '咖啡师开始制作后将无法自行取消。', confirmColor: '#70533b', success: async result => {
      if (!result.confirm) return
      this.setData({ cancelling: true })
      try { await api.cancelOrder(this.orderId); await this.load() }
      catch (error) { wx.showToast({ title: error.message, icon: 'none' }); this.load() }
      finally { this.setData({ cancelling: false }) }
    } })
  },
  menu() { wx.switchTab({ url: '/pages/menu/index' }) },
  orders() { wx.switchTab({ url: '/pages/orders/index' }) },
  copyCode() { if (this.data.order) wx.setClipboardData({ data: this.data.order.pickup_code }) }
})
