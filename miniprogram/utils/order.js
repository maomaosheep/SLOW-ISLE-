function present(order) {
  const date = new Date(order.created_at)
  const pad = value => String(value).padStart(2, '0')
  return { ...order, date_label: date.getFullYear() + '.' + pad(date.getMonth() + 1) + '.' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) }
}
module.exports = { present }
