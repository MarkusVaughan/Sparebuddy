import { useEffect, useState } from 'react'
import { budgets as budgetApi } from '../utils/api'
import { formatNOK, formatMonth } from '../utils/format'
import { getActiveMonth, setActiveMonth } from '../utils/month'

export default function Budget() {
  const [month, setMonth] = useState(getActiveMonth())
  const [items, setItems] = useState([])
  const [editId, setEditId] = useState(null)
  const [editAmount, setEditAmount] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setActiveMonth(month)
  }, [month])

  useEffect(() => {
    setLoading(true)
    budgetApi.get(month).then(setItems).finally(() => setLoading(false))
  }, [month])

  async function saveBudget(categoryId) {
    const amount = parseFloat(editAmount)
    if (isNaN(amount)) return
    await budgetApi.set({ category_id: categoryId, month, amount })
    setEditId(null)
    budgetApi.get(month).then(setItems)
  }

  const totalBudget = items.reduce((s, i) => s + (i.budget || 0), 0)
  const totalActual = items.reduce((s, i) => s + i.actual, 0)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Budsjett</h1>
          <p className="text-gray-500 text-sm">{formatMonth(month)}</p>
        </div>
        <input
          type="month"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          value={month}
          onChange={e => setMonth(e.target.value)}
        />
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Budsjett', value: formatNOK(totalBudget), color: 'text-gray-800' },
          { label: 'Faktisk forbruk', value: formatNOK(totalActual), color: 'text-red-600' },
          { label: 'Gjenstår', value: formatNOK(totalBudget - totalActual), color: totalBudget - totalActual >= 0 ? 'text-green-700' : 'text-red-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Kategori</th>
              <th className="px-4 py-3 text-right">Budsjett</th>
              <th className="px-4 py-3 text-right">Faktisk</th>
              <th className="px-4 py-3 text-right">Snitt 3 mnd</th>
              <th className="px-4 py-3 text-right">Gjenstår</th>
              <th className="px-4 py-3 text-left w-48">Fremgang</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Laster...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                Ingen data for denne måneden. Importer transaksjoner og sett budsjettmål.
              </td></tr>
            ) : items.map(item => {
              const pct = item.pct_used || 0
              const overBudget = pct > 100
              return (
                <tr key={item.category_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">
                    <span className="mr-2">{item.icon}</span>{item.category_name}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editId === item.category_id ? (
                      <div className="flex justify-end items-center gap-1">
                        <input
                          type="number"
                          className="border border-gray-200 rounded px-2 py-1 w-24 text-right text-sm"
                          value={editAmount}
                          onChange={e => setEditAmount(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveBudget(item.category_id)}
                          autoFocus
                        />
                        <button onClick={() => saveBudget(item.category_id)} className="text-green-600 text-xs font-medium px-2">✓</button>
                        <button onClick={() => setEditId(null)} className="text-gray-400 text-xs px-1">✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditId(item.category_id); setEditAmount(item.budget || '') }}
                        className="text-gray-700 hover:text-green-700 tabular-nums"
                      >
                        {item.budget > 0 ? formatNOK(item.budget) : <span className="text-gray-300">Sett mål</span>}
                      </button>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums font-medium ${overBudget ? 'text-red-600' : 'text-gray-800'}`}>
                    {formatNOK(item.actual)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                    {formatNOK(item.average_actual || 0)}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums text-sm ${
                    item.remaining === null ? 'text-gray-300' :
                    item.remaining >= 0 ? 'text-green-700' : 'text-red-600'
                  }`}>
                    {item.remaining !== null ? formatNOK(item.remaining) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {item.budget > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${overBudget ? 'bg-red-500' : 'bg-green-500'}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className={`text-xs w-10 text-right ${overBudget ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                          {pct}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">Ingen budsjett</span>
                    )}
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
