Page({
  data: { store: null, error: '' },
  onShow() { this.load() },
  async load() {
    try { const data = await getApp().getCatalog(true); this.setData({ store: data.store, error: '' }) }
    catch (error) { this.setData({ error: error.message }) }
  },
  orders() { wx.switchTab({ url: '/pages/orders/index' }) },
  menu() { wx.switchTab({ url: '/pages/menu/index' }) },
  contact() { if (this.data.store && this.data.store.phone) wx.makePhoneCall({ phoneNumber: this.data.store.phone }) },
  copyAddress() { if (this.data.store) wx.showModal({ title: this.data.store.name, content: this.data.store.address, confirmText: '复制地址', confirmColor: '#70533b', success: result => { if (result.confirm) wx.setClipboardData({ data: this.data.store.address }) } }) },
  about() { wx.showModal({ title: '慢屿咖啡', content: '认真做好每一杯日常。当前以本机点单记录为准，更换设备或清除缓存后不会保留订单入口。', showCancel: false, confirmColor: '#70533b' }) },
  retry() { this.load() },
  onShareAppMessage() { return { title: '慢一点，好喝的在这里。', path: '/pages/home/index', imageUrl: '/assets/hero.jpg' } }
})
