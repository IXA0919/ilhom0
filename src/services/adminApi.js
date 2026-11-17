import { menuItems as starterMenu } from '@data/menuData'

const VISITOR_ID_KEY = 'plov_city_visitor_uuid'
const USER_KEY = 'plov_city_admin_user_v2'
const SESSION_KEY = 'plov_city_admin_session_v2'

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Server bilan aloqa xatosi.')
  return payload
}

export function getVisitorId() {
  try {
    let id = localStorage.getItem(VISITOR_ID_KEY)
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'vis-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9)
      localStorage.setItem(VISITOR_ID_KEY, id)
    }
    return id
  } catch { return 'anon-visitor' }
}

export async function recordVisit() {
  const visitorId = getVisitorId()
  try { await api('/api/visitors', { method: 'POST', body: JSON.stringify({ visitorId }) }) }
  catch (error) {
    console.warn('Tashrifni umumiy bazaga yuborib bo‘lmadi:', error.message)
    return { success: false, error: error.message }
  }
  return { success: true }
}

export async function recordOrder(order) {
  const completeOrder = {
    ...order,
    orderNumber: order.orderNumber || 'PC-' + Date.now().toString(36).toUpperCase(),
    recordedAt: new Date().toISOString(),
    visitorId: getVisitorId(),
    status: order.status || 'new',
  }
  await api('/api/orders', { method: 'POST', body: JSON.stringify(completeOrder) })
  return { success: true, order: completeOrder }
}

export async function getMenu() {
  try {
    const { menu } = await api('/api/menu')
    if (Array.isArray(menu) && menu.length) return menu
  } catch (error) {
    console.warn('Umumiy menyu yuklanmadi:', error.message)
  }
  return starterMenu
}

export async function saveMenu(menu) {
  if (!Array.isArray(menu)) throw new Error('Menyu ro‘yxat bo‘lishi lozim')
  await api('/api/admin/menu', { method: 'PUT', body: JSON.stringify({ menu }) })
  window.dispatchEvent(new CustomEvent('plov-menu-updated', { detail: menu }))
  return { success: true, count: menu.length }
}

export async function getAdminData() {
  const data = await api('/api/admin/stats')
  const menu = Array.isArray(data.menu) && data.menu.length ? data.menu : await getMenu()
  const orders = Array.isArray(data.orders) ? data.orders : []
  const stats = data.stats || { visitors: 0, orderedVisitors: 0, browsingOnly: 0, orders: orders.length, totalRevenue: 0, conversionRate: '0.0' }
  return { menu, orders, stats }
}

export async function removeOrder(orderNumber) {
  await api('/api/admin/orders/' + encodeURIComponent(orderNumber), { method: 'DELETE' })
  return { success: true }
}

export async function updateOrderStatus(orderNumber, newStatus) {
  return api('/api/admin/orders/' + encodeURIComponent(orderNumber), {
    method: 'PATCH',
    body: JSON.stringify({ status: newStatus }),
  })
}

export async function uploadMenuImage(fileOrDataUrl) {
  if (!fileOrDataUrl) return ''
  if (typeof fileOrDataUrl === 'string' && (fileOrDataUrl.startsWith('http') || fileOrDataUrl.startsWith('data:'))) return fileOrDataUrl
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Rasm faylini o‘qib bo‘lmadi.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Rasm formatini ochib bo‘lmadi.'))
      img.onload = () => {
        const max = 900
        const ratio = Math.min(1, max / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * ratio))
        canvas.height = Math.max(1, Math.round(img.height * ratio))
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.72))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(fileOrDataUrl)
  })
}

export async function getAdminSession() {
  try {
    const result = await api('/api/admin/session')
    if (result.authenticated) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ authenticated: true }))
    else sessionStorage.removeItem(SESSION_KEY)
    return result.authenticated === true
  } catch { return false }
}

export async function adminLogin(identifier, password) {
  const result = await api('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username: (identifier || '').trim(), password: password || '' }),
  })
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ authenticated: true }))
  localStorage.setItem(USER_KEY, JSON.stringify({ username: (identifier || 'owner').trim(), lastPasswordChange: new Date().toISOString() }))
  return { success: true, session: result }
}

export async function adminLogout() {
  try { await api('/api/admin/logout', { method: 'POST', body: '{}' }) } finally {
    sessionStorage.removeItem(SESSION_KEY)
  }
  return { success: true }
}

export async function changeAdminPassword({ currentPassword, newPassword, newUsername }) {
  const result = await api('/api/admin/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword, newUsername }),
  })
  const current = getAdminAccountInfo()
  localStorage.setItem(USER_KEY, JSON.stringify({
    username: result.username || newUsername || current.username || 'owner',
    lastPasswordChange: new Date().toISOString(),
  }))
  return { success: true, username: result.username }
}

export function getAdminAccountInfo() {
  try { return { username: 'owner', ...JSON.parse(localStorage.getItem(USER_KEY) || '{}') } }
  catch { return { username: 'owner' } }
}


