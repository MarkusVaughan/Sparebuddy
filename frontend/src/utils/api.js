import axios from 'axios'

export const AUTH_TOKEN_STORAGE_KEY = 'sparebuddy-auth-token'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const authToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`
    }
  }
  return config
})

export const auth = {
  login: (data) => api.post('/auth/login', data).then(r => r.data),
  register: (data) => api.post('/auth/register', data).then(r => r.data),
  logout: () => api.post('/auth/logout').then(r => r.data),
  me: () => api.get('/auth/me').then(r => r.data),
}

export const transactions = {
  list: (params) => api.get('/transactions/', { params }).then(r => r.data),
  update: (id, data) => api.patch(`/transactions/${id}`, data).then(r => r.data),
  setSplit: (id, data) => api.put(`/transactions/${id}/split`, data).then(r => r.data),
  updateSplit: (id, data) => api.patch(`/transactions/splits/${id}`, data).then(r => r.data),
  import: (accountId, file) => {
    const form = new FormData()
    form.append('account_id', accountId)
    form.append('file', file)
    return api.post('/transactions/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },
  applyRules: (params) => api.post('/transactions/apply-rules', null, { params }).then(r => r.data),
  monthlySummary: (month) => api.get('/transactions/summary/monthly', { params: { month } }).then(r => r.data),
}

export const accounts = {
  list: () => api.get('/accounts/').then(r => r.data),
  create: (data) => api.post('/accounts/', data).then(r => r.data),
  delete: (id) => api.delete(`/accounts/${id}`).then(r => r.data),
}

export const categories = {
  list: () => api.get('/categories/').then(r => r.data),
  ruleSuggestions: (query) => api.get('/categories/rule-suggestions', { params: { q: query } }).then(r => r.data),
  create: (data) => api.post('/categories/', data).then(r => r.data),
  update: (id, data) => api.patch(`/categories/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/categories/${id}`).then(r => r.data),
  addRule: (categoryId, matchText) =>
    api.post(`/categories/${categoryId}/rules`, { match_text: matchText }).then(r => r.data),
  deleteRule: (ruleId) => api.delete(`/categories/rules/${ruleId}`).then(r => r.data),
}

export const budgets = {
  get: (month) => api.get(`/budgets/${month}`).then(r => r.data),
  set: (data) => api.post('/budgets/', data).then(r => r.data),
}

export const assets = {
  list: () => api.get('/assets/').then(r => r.data),
  history: (ownerUserId, name) => api.get(`/assets/history/${ownerUserId}/${encodeURIComponent(name)}`).then(r => r.data),
  netWorthHistory: () => api.get('/assets/net-worth-history').then(r => r.data),
  record: (data) => api.post('/assets/', data).then(r => r.data),
  update: (id, data) => api.patch(`/assets/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/assets/${id}`).then(r => r.data),
}

export const goals = {
  list: () => api.get('/goals/').then(r => r.data),
  create: (data) => api.post('/goals/', data).then(r => r.data),
  update: (id, data) => api.patch(`/goals/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/goals/${id}`).then(r => r.data),
}

export const users = {
  list: () => api.get('/users/').then(r => r.data),
  me: () => api.get('/users/me').then(r => r.data),
  updateProfile: (data) => api.patch('/users/me', data).then(r => r.data),
  changePassword: (data) => api.patch('/users/me/password', data).then(r => r.data),
  deactivate: (data) => api.post('/users/me/deactivate', data).then(r => r.data),
  completeOnboarding: () => api.patch('/users/me/onboarding', { onboarding_completed: true }).then(r => r.data),
  trusted: () => api.get('/users/me/trusted').then(r => r.data),
  invites: () => api.get('/users/me/invites').then(r => r.data),
  createInvite: (data) => api.post('/users/me/invites', data).then(r => r.data),
  revokeInvite: (id) => api.delete(`/users/me/invites/${id}`).then(r => r.data),
}

export const notifications = {
  list: () => api.get('/notifications/').then(r => r.data),
  count: () => api.get('/notifications/count').then(r => r.data),
  respond: (type, id, data) => api.post(`/notifications/${type}/${id}/respond`, data).then(r => r.data),
  withdraw: (type, id) => api.delete(`/notifications/${type}/${id}`).then(r => r.data),
  leave: (type, id) => api.post(`/notifications/${type}/${id}/leave`).then(r => r.data),
}

export default api
