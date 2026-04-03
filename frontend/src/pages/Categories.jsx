import { useEffect, useState } from 'react'
import { categories as catApi } from '../utils/api'
import { Plus, Trash2, X } from 'lucide-react'

export default function Categories() {
  const [cats, setCats] = useState([])
  const [errorMsg, setErrorMsg] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newCat, setNewCat] = useState({ name: '', color: '#22c55e', icon: '💳', category_type: 'expense' })
  const [ruleInputs, setRuleInputs] = useState({})
  const [ruleSuggestions, setRuleSuggestions] = useState([])

  const load = () => catApi.list().then(setCats)
  useEffect(() => { load() }, [])

  async function createCategory(e) {
    e.preventDefault()
    await catApi.create(newCat)
    setNewCat({ name: '', color: '#22c55e', icon: '💳', category_type: 'expense' })
    setShowNew(false)
    load()
  }

  async function addRule(categoryId) {
    const text = ruleInputs[categoryId]?.trim()
    if (!text) return
    await catApi.addRule(categoryId, text)
    setRuleInputs(r => ({ ...r, [categoryId]: '' }))
    setRuleSuggestions([])
    load()
  }

  async function deleteRule(ruleId) {
    await catApi.deleteRule(ruleId)
    load()
  }

  async function deleteCategory(id) {
    if (!confirm('Slett kategorien? Transaksjoner vil miste kategoritilknytning.')) return
    try {
      setErrorMsg('')
      await catApi.delete(id)
      load()
    } catch (error) {
      setErrorMsg(error?.response?.data?.detail || 'Kunne ikke slette kategori.')
    }
  }

  async function handleRuleInput(categoryId, value) {
    setRuleInputs(current => ({ ...current, [categoryId]: value }))
    const query = value.trim()
    if (query.length < 2) {
      setRuleSuggestions([])
      return
    }
    try {
      const suggestions = await catApi.ruleSuggestions(query)
      setRuleSuggestions(suggestions)
    } catch {
      setRuleSuggestions([])
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kategorier</h1>
          <p className="text-sm text-gray-500">Administrer kategorier og auto-kategoriseringsregler</p>
        </div>
        <button
          onClick={() => setShowNew(!showNew)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
        >
          <Plus size={16} /> Ny kategori
        </button>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-6 text-sm">
          {errorMsg}
        </div>
      )}

      {showNew && (
        <form onSubmit={createCategory} className="bg-white rounded-xl border border-gray-200 p-5 mb-6 flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Navn</label>
            <input
              required
              type="text"
              placeholder="Kategori navn"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-40"
              value={newCat.name}
              onChange={e => setNewCat(c => ({ ...c, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Ikon</label>
            <input
              type="text"
              maxLength={2}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-16 text-center"
              value={newCat.icon}
              onChange={e => setNewCat(c => ({ ...c, icon: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Farge</label>
            <input
              type="color"
              className="h-10 w-16 border border-gray-200 rounded-lg cursor-pointer"
              value={newCat.color}
              onChange={e => setNewCat(c => ({ ...c, color: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <select
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={newCat.category_type}
              onChange={e => setNewCat(c => ({ ...c, category_type: e.target.value }))}
            >
              <option value="expense">Utgift</option>
              <option value="income">Inntekt</option>
            </select>
          </div>
          <button type="submit" className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">Opprett</button>
          <button type="button" onClick={() => setShowNew(false)} className="px-4 py-2 border border-gray-200 text-sm rounded-lg hover:bg-gray-50">Avbryt</button>
        </form>
      )}

      <div className="space-y-3">
        {cats.map(cat => (
          <div key={cat.id} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                  style={{ backgroundColor: cat.color + '22', border: `2px solid ${cat.color}` }}
                >
                  {cat.icon}
                </span>
                <div>
                  <span className="font-medium text-gray-800">{cat.name}</span>
                  <span className="ml-2 text-xs text-gray-400 capitalize">{cat.category_type === 'expense' ? 'Utgift' : 'Inntekt'}</span>
                </div>
              </div>
              <button onClick={() => deleteCategory(cat.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                <Trash2 size={15} />
              </button>
            </div>

            {/* Rules */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Auto-kategoriseringsregler</p>
              <div className="flex flex-wrap gap-2 mb-2">
                {cat.rules.map(rule => (
                  <span key={rule.id} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full">
                    {rule.match_text}
                    <button onClick={() => deleteRule(rule.id)} className="text-gray-400 hover:text-red-500 ml-0.5">
                      <X size={11} />
                    </button>
                  </span>
                ))}
                {cat.rules.length === 0 && (
                  <span className="text-xs text-gray-300">Ingen regler ennå</span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder='f.eks. "REMA 1000"'
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs w-48"
                  value={ruleInputs[cat.id] || ''}
                  list="category-rule-suggestions"
                  onChange={e => handleRuleInput(cat.id, e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addRule(cat.id)}
                />
                <button
                  onClick={() => addRule(cat.id)}
                  className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
                >
                  + Legg til
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <datalist id="category-rule-suggestions">
        {ruleSuggestions.map(suggestion => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
    </div>
  )
}
