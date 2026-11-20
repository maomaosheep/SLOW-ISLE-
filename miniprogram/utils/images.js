const { API_BASE_URL } = require('../config')
const origin = API_BASE_URL.replace(/\/api\/?$/, '')
const builtIn = {
  'latte.jpg': '/assets/latte.jpg',
  'americano.jpg': '/assets/americano.jpg',
  'croissant.jpg': '/assets/croissant.jpg'
}

function imageSource(source, fallback) {
  if (!source) return builtIn[fallback] || ''
  // Built-in photos already ship with the app; avoid an HTTP request on phones.
  const match = source.match(/^(?:https?:\/\/[^/]+)?\/static\/coffee\/products\/([^/?#]+)(?:[?#].*)?$/i)
  if (match && builtIn[match[1]]) return builtIn[match[1]]
  if (/^\/(?:media|static)\//.test(source)) return origin + source
  // Older cart/order snapshots may still point at the development computer's loopback.
  return source.replace(/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?=\/(?:media|static)\/)/i, origin)
}

function withImages(data) {
  if (!data || typeof data !== 'object') return data
  const result = { ...data }
  if ('image' in result) result.image = imageSource(result.image, result.fallback_image)
  for (const key of ['products', 'items', 'results']) {
    if (Array.isArray(result[key])) result[key] = result[key].map(withImages)
  }
  return result
}

module.exports = { imageSource, withImages }
