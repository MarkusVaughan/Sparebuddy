import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { transactions as txApi, assets as assetApi } from '../utils/api'
import { formatNOK, formatMonth, currentMonth } from '../utils/format'
import { TrendingDown, TrendingUp, PiggyBank } from 'lucide-react'

export default function Dashboard() {
  const month = currentMonth()
  const [summary, setSummary] = useState([])
  const [assetData, setAssetData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      txApi.monthlySummary(month),
      assetApi.list(),
    ]).then(([s, a]) => {
      setSummary(s)
      setAssetData(a)
    }).finally(() => setLoading(false))
  }, [month])

  const totalSpent = summary.reduce((sum, c) => sum + c.total, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Laster...
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h1>
      <p className="text-gray-500 mb-8">{formatMonth(month)}</p>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <KpiCard
          label="Brukt denne måneden"
          value={formatNOK(totalSpent)}
          icon={<TrendingDown className="text-red-400" />}
          accent="red"
        />
        <KpiCard
          label="Total formue"
          value={assetData ? formatNOK(assetData.total_net_worth) : '—'}
          icon={<PiggyBank className="text-green-500" />}
          accent="green"
        />
        <KpiCard
          label="Ukategorisert"
          value={`${summary.filter(s => !s.category_name).length} poster`}
          icon={<TrendingUp className="text-yellow-500" />}
          accent="yellow"
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
            <div className="space-y-3">
              {assetData.assets.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{a.name}</p>
                    <p className="text-xs text-gray-400 capitalize">{a.asset_type}</p>
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{formatNOK(a.value)}</p>
                </div>
              ))}
              <div className="flex justify-between pt-2 font-bold text-sm">
                <span>Totalt</span>
                <span className="text-green-700">{formatNOK(assetData.total_net_worth)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, icon, accent }) {
  const accents = {
    red: 'bg-red-50',
    green: 'bg-green-50',
    yellow: 'bg-yellow-50',
  }
  return (
    <div className={`rounded-xl border border-gray-200 p-5 bg-white`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{label}</span>
        <span className={`p-2 rounded-lg ${accents[accent]}`}>{icon}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
