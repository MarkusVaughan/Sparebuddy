import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

export const transactions = {
  list: (params) => api.get('/transactions/', { params }).then(r => r.data),
  update: (id, data) => api.patch(`/transactions/${id}`, data).then(r => r.data),
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
  create: (data) => api.post('/categories/', data).then(r => r.data),
  update: (id, data) => api.patch(`/categories/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/categories/${id}`).then(r => r.data),
  addRule: (categoryId, matchText) =>
    api.post(`/categories/${categoryId}/rules`, { match_text: matchText }).then(r => r.data),
  deleteRule: (ruleId) => api.delete(`/categories/rules/${ruleId}`).then(r => r.data),
}

export const budgets = {
  get: (month, userId = 1) => api.get(`/budgets/${month}`, { params: { user_id: userId } }).then(r => r.data),
  set: (data) => api.post('/budgets/', data).then(r => r.data),
}

export const assets = {
  list: (userId = 1) => api.get('/assets/', { params: { user_id: userId } }).then(r => r.data),
  history: (name) => api.get(`/assets/history/${encodeURIComponent(name)}`).then(r => r.data),
  record: (data) => api.post('/assets/', data).then(r => r.data),
  delete: (id) => api.delete(`/assets/${id}`).then(r => r.data),
}

export default api
