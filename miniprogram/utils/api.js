const { API_BASE_URL } = require('../config')
const { withImages } = require('./images')
let connecting = null

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: API_BASE_URL + path,
      method: options.method || 'GET',
      data: options.data,
      timeout: 15000,
      header: { 'Content-Type': 'application/json', ...(options.token ? { Authorization: 'Bearer ' + options.token } : {}) },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(withImages(response.data))
        else {
          const message = response.data && response.data.message
          const error = new Error(message || '门店服务暂时繁忙，请稍后重试。')
          error.status = response.statusCode
          reject(error)
        }
      },
      fail() { reject(new Error('连接不到门店，请检查网络后重试。')) }
    })
  })
}

function getToken() {
  const token = wx.getStorageSync('slow_isle_token')
  if (token) return Promise.resolve(token)
  if (!connecting) {
    connecting = request('/session/', { method: 'POST' }).then(data => {
      wx.setStorageSync('slow_isle_token', data.token)
      return data.token
    }).finally(() => { connecting = null })
  }
  return connecting
}

function authenticated(path, options = {}) {
  return getToken().then(token => request(path, { ...options, token }))
}

module.exports = {
  catalog: () => request('/catalog/'),
  pickupSlots: productIds => request('/pickup-slots/?product_ids=' + [...new Set(productIds)].join(',')),
  orders: (page = 1, kind = 'all') => authenticated('/orders/?page=' + page + '&kind=' + encodeURIComponent(kind)),
  order: id => authenticated('/orders/' + encodeURIComponent(id) + '/'),
  createOrder: data => authenticated('/orders/create/', { method: 'POST', data }),
  cancelOrder: id => authenticated('/orders/' + encodeURIComponent(id) + '/cancel/', { method: 'POST' })
}
