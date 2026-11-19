Component({
  properties: { visible: Boolean, items: Array, total: String, count: Number },
  methods: {
    close() { this.triggerEvent('close') },
    noop() {},
    change(event) { this.triggerEvent('change', { key: event.currentTarget.dataset.key, delta: Number(event.currentTarget.dataset.delta) }) },
    checkout() { if (this.properties.count) this.triggerEvent('checkout') },
    clear() { this.triggerEvent('clear') }
  }
})
