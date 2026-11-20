function cents(value) {
  return Math.round(Number(value) * 100)
}
function money(value) { return (value / 100).toFixed(2) }
function canOrder(product) { return !!product && (!product.is_out_of_stock || product.reservation_only) }
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
    reservation_only: !!product.reservation_only, reservation_lead_minutes: product.reservation_lead_minutes || 60,
    is_out_of_stock: !!product.is_out_of_stock,
    options, specification: labels.join(' / '), quantity,
    unitCents, unit_price: money(unitCents), subtotal: money(unitCents * quantity)
  }
}
function totals(items) {
  return { count: items.reduce((sum, item) => sum + item.quantity, 0), total: money(items.reduce((sum, item) => sum + item.unitCents * item.quantity, 0)) }
}
function add(items, line) {
  if (!canOrder(line)) throw new Error('商品暂时缺货，不接受下单或预约。')
  const next = items.map(item => ({ ...item })), found = next.find(item => item.key === line.key)
  if (found) found.quantity += line.quantity
  else next.push({ ...line })
  return checked(next)
}
function change(items, key, delta) {
  if (delta > 0 && items.some(item => item.key === key && !canOrder(item))) throw new Error('商品暂时缺货，请先移除。')
  return checked(items.map(item => ({ ...item, quantity: item.key === key ? item.quantity + delta : item.quantity }))
    .filter(item => item.quantity > 0))
}
function checked(items) {
  if (items.some(item => item.quantity > 20)) throw new Error('同规格商品最多 20 件。')
  if (totals(items).count > 50 || items.length > 30) throw new Error('单笔最多 50 件、30 项商品。')
  return items.map(item => ({ ...item, subtotal: money(item.unitCents * item.quantity) }))
}
function reconcile(items, products) {
  let changed = false
  const next = []
  items.forEach(item => {
    const product = products.find(p => p.id === item.product_id)
    if (!product) { changed = true; return }
    try {
      const line = lineFor(product, item.options, item.quantity)
      if (line.unitCents !== item.unitCents || line.key !== item.key || line.name !== item.name || line.reservation_only !== !!item.reservation_only || line.is_out_of_stock !== !!item.is_out_of_stock || (line.reservation_only && line.reservation_lead_minutes !== item.reservation_lead_minutes)) changed = true
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
module.exports = { cents, money, canOrder, lineFor, totals, add, change, reconcile, requestId }
