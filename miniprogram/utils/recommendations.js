const { canOrder } = require('./cart')
// Sample without replacement; exclude baked goods and unavailable stock.
function chooseCoffee(products, categories, previousIds = [], random = Math.random) {
  const bakery = new Set(categories.filter(c => /烘焙|小食|甜点|糕点|面包/.test(c.name)).map(c => c.id))
  const coffeeCategories = new Set(categories.filter(c => /咖啡|特调|手冲|意式/.test(c.name)).map(c => c.id))
  const coffee = products.filter(p => canOrder(p) && !bakery.has(p.category_id) && (coffeeCategories.has(p.category_id) || /咖啡|拿铁|美式|卡布|澳白|Coffee|Latte|Americano|Espresso|Mocha|Cappuccino|Flat White/i.test(p.name + ' ' + (p.english_name || ''))))
  const pool = coffee.slice()
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const selected = pool.slice(0, 2)
  if (pool.length > 2 && selected.length === previousIds.length && selected.every(p => previousIds.includes(p.id))) {
    selected[1] = pool.find(p => !previousIds.includes(p.id))
  }
  return selected
}
module.exports = { chooseCoffee }
