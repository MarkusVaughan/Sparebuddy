import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { transactions as txApi, assets as assetApi } from '../utils/api'
import { formatNOK, formatMonth } from '../utils/format'
import { getActiveMonth, setActiveMonth } from '../utils/month'
import { TrendingDown, TrendingUp, PiggyBank } from 'lucide-react'

export default function Dashboard() {
  const navigate = useNavigate()
  const [month, setMonth] = useState(getActiveMonth())
  const [summary, setSummary] = useState([])
  const [assetData, setAssetData] = useState(null)
  const [uncategorizedCount, setUncategorizedCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setActiveMonth(month)
  }, [month])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      txApi.monthlySummary(month),
      assetApi.list(),
      txApi.list({ month, uncategorized: true, limit: 1 }),
    ]).then(([s, a, uncategorized]) => {
      setSummary(s)
      setAssetData(a)
      setUncategorizedCount(uncategorized.total || 0)
    }).finally(() => setLoading(false))
  }, [month])

  const totalSpent = summary.reduce((sum, c) => sum + c.total, 0)
  const grossAssets = assetData
    ? assetData.assets.filter(a => a.value >= 0).reduce((s, a) => s + a.value, 0)
    : null

  function goToTransactions(extraParams = {}) {
    const params = new URLSearchParams({ month, ...extraParams })
    navigate(`/transactions?${params.toString()}`)
  }

  function goToAssets(extraParams = {}) {
    const params = new URLSearchParams(extraParams)
    navigate(params.toString() ? `/assets?${params.toString()}` : '/assets')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Laster...
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-end justify-between gap-4 mb-8 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h1>
          <p className="text-gray-500">{formatMonth(month)}</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Måned</label>
          <input
            type="month"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            value={month}
            onChange={e => setMonth(e.target.value)}
          />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <KpiCard
          label="Brukt denne måneden"
          value={formatNOK(totalSpent)}
          icon={<TrendingDown className="text-red-400" />}
          accent="red"
          onClick={() => goToTransactions()}
        />
        <KpiCard
          label="Eiendeler"
          value={grossAssets !== null ? formatNOK(grossAssets) : '—'}
          icon={<PiggyBank className="text-green-500" />}
          accent="green"
          onClick={() => goToAssets()}
        />
        <KpiCard
          label="Ukategorisert"
          value={`${uncategorizedCount} poster`}
          icon={<TrendingUp className="text-yellow-500" />}
          accent="yellow"
          onClick={() => goToTransactions({ uncategorized: 'true' })}
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Spending by category pie chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Forbruk per kategori</h2>
          {summary.length === 0 ? (
            <p className="text-gray-400 text-sm">Ingen transaksjoner denne måneden ennå.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={summary}
                  dataKey="total"
                  nameKey="category_name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  onClick={(entry) => {
                    if (entry?.category_id) {
                      goToTransactions({ category_id: String(entry.category_id) })
                    }
                  }}
                  label={({ category_name, percent }) =>
                    `${category_name} ${(percent * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {summary.map((entry, i) => (
                    <Cell key={i} fill={entry.color || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatNOK(v)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Asset breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Formuesoversikt</h2>
          {!assetData || assetData.assets.length === 0 ? (
            <p className="text-gray-400 text-sm">
              Ingen formue registrert ennå. Gå til Formue-siden for å legge til.
            </p>
          ) : (
            <div className="space-y-2">
              {assetData.assets.filter(a => a.value >= 0).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => goToAssets({ name: a.name })}
                  className="w-full flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 rounded-lg px-1 text-left transition-colors"
                >
                  <p className="text-sm text-gray-700">{a.name}</p>
                  <p className="text-sm font-semibold text-green-700 tabular-nums">{formatNOK(a.value)}</p>
                </button>
              ))}
              <button
                type="button"
                onClick={() => goToAssets()}
                className="w-full flex justify-between pt-2 border-t border-gray-200 text-sm font-bold text-left"
              >
                <span className="text-gray-700">Eiendeler</span>
                <span className="text-green-700">{formatNOK(grossAssets)}</span>
              </button>
              {assetData.assets.filter(a => a.value < 0).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => goToAssets({ name: a.name })}
                  className="w-full flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 rounded-lg px-1 text-left transition-colors"
                >
                  <p className="text-sm text-gray-500">{a.name}</p>
                  <p className="text-sm font-semibold text-red-500 tabular-nums">−{formatNOK(Math.abs(a.value))}</p>
                </button>
              ))}
              <button
                type="button"
                onClick={() => goToAssets()}
                className="w-full flex justify-between pt-2 border-t border-gray-200 text-sm font-bold text-left"
              >
                <span className="text-gray-700">Nettoformue</span>
                <span className={assetData.total_net_worth >= 0 ? 'text-blue-700' : 'text-orange-600'}>
                  {formatNOK(assetData.total_net_worth)}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, icon, accent, onClick }) {
  const accents = {
    red: 'bg-red-50',
    green: 'bg-green-50',
    yellow: 'bg-yellow-50',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-gray-200 p-5 bg-white text-left hover:border-gray-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{label}</span>
        <span className={`p-2 rounded-lg ${accents[accent]}`}>{icon}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </button>
  )
}
