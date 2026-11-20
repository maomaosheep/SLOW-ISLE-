const { canOrder } = require('../../utils/cart')
Component({
  properties: { visible: Boolean, items: Array, total: String, count: Number },
  data: { stockBlocked: false },
  observers: { items(items) { this.setData({ stockBlocked: (items || []).some(item => !canOrder(item)) }) } },
  methods: {
    close() { this.triggerEvent('close') },
    noop() {},
    change(event) { this.triggerEvent('change', { key: event.currentTarget.dataset.key, delta: Number(event.currentTarget.dataset.delta) }) },
    checkout() { if (this.properties.count && !(this.properties.items || []).some(item => !canOrder(item))) this.triggerEvent('checkout') },
    clear() { this.triggerEvent('clear') }
  }
})
