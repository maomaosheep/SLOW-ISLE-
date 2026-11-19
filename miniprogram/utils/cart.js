function cents(value) {
  return Math.round(Number(value) * 100)
}
function money(value) { return (value / 100).toFixed(2) }
function lineFor(product, selected, quantity) {
  const options = {}, labels = []
  let unitCents = cents(product.price)
  Object.keys(product.options).forEach(key => {
    const choice = product.options[key].find(item => item.label === selected[key])
    if (!choice) throw new Error('商品规格已更新，请重新选择。')
    options[key] = choice.label
    labels.push(choice.label)
    unitCents += cents(choice.extra || 0)
  })
  return {
    key: String(product.id) + ':' + JSON.stringify(options), product_id: product.id,
    name: product.name, image: product.image, fallback_image: product.fallback_image,
    options, specification: labels.join(' / '), quantity,
    unitCents, unit_price: money(unitCents), subtotal: money(unitCents * quantity)
  }
}
function totals(items) {
  return { count: items.reduce((sum, item) => sum + item.quantity, 0), total: money(items.reduce((sum, item) => sum + item.unitCents * item.quantity, 0)) }
}
function add(items, line) {
  const next = items.map(item => ({ ...item })), found = next.find(item => item.key === line.key)
  if (found) found.quantity += line.quantity
  else next.push({ ...line })
  if (next.some(item => item.quantity > 20)) throw new Error('同规格商品最多 20 件。')
  if (totals(next).count > 50 || next.length > 30) throw new Error('单笔最多 50 件、30 项商品。')
  return next.map(item => ({ ...item, subtotal: money(item.unitCents * item.quantity) }))
}
function change(items, key, delta) {
  return items.map(item => ({ ...item, quantity: item.key === key ? item.quantity + delta : item.quantity }))
    .filter(item => item.quantity > 0)
    .map(item => ({ ...item, subtotal: money(item.unitCents * item.quantity) }))
}
function reconcile(items, products) {
  let changed = false
  const next = []
  items.forEach(item => {
    const product = products.find(p => p.id === item.product_id)
    if (!product) { changed = true; return }
    try {
      const line = lineFor(product, item.options, item.quantity)
      if (line.unitCents !== item.unitCents || line.key !== item.key || line.name !== item.name) changed = true
      next.push(line)
    } catch (_) { changed = true }
  })
  return { items: next, changed }
}
function requestId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const n = Math.floor(Math.random() * 16)
    return (char === 'x' ? n : (n & 3) | 8).toString(16)
  })
}
module.exports = { cents, money, lineFor, totals, add, change, reconcile, requestId }
