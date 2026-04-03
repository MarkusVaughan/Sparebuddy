import { useEffect, useState } from 'react'
import { assets as assetApi } from '../utils/api'
import { formatNOK, formatDate } from '../utils/format'
import { Plus, Trash2 } from 'lucide-react'

const ASSET_TYPES = [
  { value: 'bank', label: 'Bankkonto', emoji: '🏦' },
  { value: 'investment', label: 'Investering', emoji: '📈' },
  { value: 'pension', label: 'Pensjon', emoji: '🧓' },
  { value: 'property', label: 'Eiendom', emoji: '🏠' },
  { value: 'other', label: 'Annet', emoji: '💼' },
]

const typeLabel = (t) => ASSET_TYPES.find(x => x.value === t) || { label: t, emoji: '💼' }

export default function Assets() {
  const [data, setData] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    name: '', asset_type: 'bank', value: '', recorded_date: new Date().toISOString().split('T')[0], notes: ''
  })
  const [saving, setSaving] = useState(false)

  const load = () => assetApi.list().then(setData)
  useEffect(() => { load() }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await assetApi.record({ ...form, value: parseFloat(form.value) })
      await load()
      setShowForm(false)
      setForm({ name: '', asset_type: 'bank', value: '', recorded_date: new Date().toISOString().split('T')[0], notes: '' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Slett denne formuesposten?')) return
    await assetApi.delete(id)
    load()
  }

  const byType = data
    ? ASSET_TYPES.filter(t => data.by_type[t.value]).map(t => ({
        ...t, total: data.by_type[t.value]
      }))
    : []

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Formue</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
        >
          <Plus size={16} /> Registrer verdi
        </button>
      </div>

      {/* Total */}
      {data && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6">
          <p className="text-sm text-green-700 mb-1">Total nettoformue</p>
          <p className="text-4xl font-bold text-green-800">{formatNOK(data.total_net_worth)}</p>
        </div>
      )}

      {/* Type breakdown */}
      {byType.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {byType.map(t => (
            <div key={t.value} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm text-gray-500 mb-1">{t.emoji} {t.label}</p>
              <p className="text-xl font-bold text-gray-800">{formatNOK(t.total)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 mb-6 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Navn</label>
            <input
              required
              type="text"
              placeholder="f.eks. DNB BSU"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={form.asset_type}
              onChange={e => setForm(f => ({ ...f, asset_type: e.target.value }))}
            >
              {ASSET_TYPES.map(t => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Verdi (kr)</label>
            <input
              required
              type="number"
              step="0.01"
              placeholder="0"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={form.value}
              onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Dato</label>
            <input
              required
              type="date"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={form.recorded_date}
              onChange={e => setForm(f => ({ ...f, recorded_date: e.target.value }))}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Notat (valgfritt)</label>
            <input
              type="text"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="col-span-2 flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Avbryt</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              {saving ? 'Lagrer...' : 'Lagre'}
            </button>
          </div>
        </form>
      )}

      {/* Asset list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Navn</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-right">Verdi</th>
              <th className="px-4 py-3 text-left">Dato</th>
              <th className="px-4 py-3 text-left">Notat</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {!data || data.assets.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                Ingen formue registrert ennå. Klikk "Registrer verdi" for å starte.
              </td></tr>
            ) : data.assets.map(a => {
              const t = typeLabel(a.asset_type)
              return (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{a.name}</td>
                  <td className="px-4 py-3 text-gray-500">{t.emoji} {t.label}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">{formatNOK(a.value)}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(a.recorded_date)}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{a.notes || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(a.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
