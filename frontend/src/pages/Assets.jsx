import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { assets as assetApi } from '../utils/api'
import { formatNOK, formatDate } from '../utils/format'
import { Clock3, Pencil, Plus, Trash2, X } from 'lucide-react'

const ASSET_TYPES = [
  { value: 'bank', label: 'Bankkonto', emoji: '🏦' },
  { value: 'investment', label: 'Investering', emoji: '📈' },
  { value: 'pension', label: 'Pensjon', emoji: '🧓' },
  { value: 'property', label: 'Eiendom', emoji: '🏠' },
  { value: 'other', label: 'Annet', emoji: '💼' },
]

const emptyNewForm = () => ({
  name: '',
  asset_type: 'bank',
  value: '',
  recorded_date: new Date().toISOString().split('T')[0],
  notes: '',
})

const emptyEditForm = () => ({
  asset_type: 'bank',
  notes: '',
})

const emptySnapshotForm = () => ({
  value: '',
  recorded_date: new Date().toISOString().split('T')[0],
  notes: '',
})

const CHART_SERIES_STORAGE_KEY = 'sparebuddy-assets-chart-series'
const DEFAULT_SERIES = 'Netto'
const RANGE_OPTIONS = [
  { value: '3m', label: '3 mnd' },
  { value: '6m', label: '6 mnd' },
  { value: '1y', label: '1 år' },
  { value: 'all', label: 'Alle' },
]

const typeLabel = (type) => ASSET_TYPES.find(item => item.value === type) || { label: type, emoji: '💼' }

const shortDate = (iso) =>
  new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' }).format(new Date(iso))

const formatYAxis = (value) =>
  value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M`
  : value >= 1_000 ? `${(value / 1_000).toFixed(0)}k`
  : `${value}`

function formatAssetValue(asset, value) {
  return formatNOK(asset.value < 0 ? Math.abs(value) : value)
}

function snapshotValueForSave(asset, rawValue) {
  const parsed = parseFloat(rawValue)
  if (Number.isNaN(parsed)) return null
  return asset.value < 0 ? -Math.abs(parsed) : Math.abs(parsed)
}

function buildHistoryMap(items) {
  return Object.fromEntries(items)
}

function getDelta(asset, history) {
  if (!history || history.length < 2) return null
  const previous = history[history.length - 2].value
  const current = history[history.length - 1].value

  if (asset.value < 0) {
    const debtChange = Math.abs(previous) - Math.abs(current)
    return {
      amount: Math.abs(debtChange),
      positive: debtChange >= 0,
      prefix: debtChange >= 0 ? 'Ned' : 'Opp',
    }
  }

  const delta = current - previous
  return {
    amount: Math.abs(delta),
    positive: delta >= 0,
    prefix: delta >= 0 ? '+' : '−',
  }
}

export default function Assets() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [history, setHistory] = useState([])
  const [assetHistories, setAssetHistories] = useState({})
  const [selectedSeries, setSelectedSeries] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_SERIES
    return window.localStorage.getItem(CHART_SERIES_STORAGE_KEY) || DEFAULT_SERIES
  })
  const [selectedRange, setSelectedRange] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState(emptyEditForm())
  const [snapshotName, setSnapshotName] = useState(null)
  const [snapshotForm, setSnapshotForm] = useState(emptySnapshotForm())
  const [selectedHistoryName, setSelectedHistoryName] = useState(searchParams.get('name'))
  const [errorMsg, setErrorMsg] = useState('')
  const [form, setForm] = useState(emptyNewForm())
  const [saving, setSaving] = useState(false)

  async function load() {
    const [assetData, netWorthHistory] = await Promise.all([
      assetApi.list(),
      assetApi.netWorthHistory(),
    ])

    const uniqueNames = [...new Set(assetData.assets.map(asset => asset.name))]
    const histories = await Promise.all(
      uniqueNames.map(async (name) => [name, await assetApi.history(name)]),
    )

    setData(assetData)
    setHistory(netWorthHistory)
    setAssetHistories(buildHistoryMap(histories))
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const params = {}
    if (selectedHistoryName) params.name = selectedHistoryName
    setSearchParams(params, { replace: true })
  }, [selectedHistoryName, setSearchParams])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CHART_SERIES_STORAGE_KEY, selectedSeries)
    }
  }, [selectedSeries])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setErrorMsg('')
    try {
      await assetApi.record({ ...form, value: parseFloat(form.value) })
      await load()
      setShowForm(false)
      setForm(emptyNewForm())
    } catch (error) {
      setErrorMsg(error?.response?.data?.detail || 'Kunne ikke lagre formuespost.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Slett denne formuesposten?')) return
    setErrorMsg('')
    try {
      await assetApi.delete(id)
      await load()
    } catch (error) {
      setErrorMsg(error?.response?.data?.detail || 'Kunne ikke slette formuespost.')
    }
  }

  function startEdit(asset) {
    setEditId(asset.id)
    setEditForm({
      asset_type: asset.asset_type,
      notes: asset.notes || '',
    })
  }

  function cancelEdit() {
    setEditId(null)
    setEditForm(emptyEditForm())
  }

  async function saveEdit(assetId) {
    setErrorMsg('')
    try {
      await assetApi.update(assetId, {
        asset_type: editForm.asset_type,
        notes: editForm.notes,
      })
      await load()
      cancelEdit()
    } catch (error) {
      setErrorMsg(error?.response?.data?.detail || 'Kunne ikke oppdatere formuespost.')
    }
  }

  function startSnapshot(asset) {
    setSnapshotName(asset.name)
    setSnapshotForm({
      value: String(Math.abs(asset.value)),
      recorded_date: new Date().toISOString().split('T')[0],
      notes: asset.notes || '',
    })
  }

  function cancelSnapshot() {
    setSnapshotName(null)
    setSnapshotForm(emptySnapshotForm())
  }

  async function saveSnapshot(asset) {
    const nextValue = snapshotValueForSave(asset, snapshotForm.value)
    if (nextValue === null) return
    setErrorMsg('')
    try {
      await assetApi.record({
        name: asset.name,
        asset_type: editId === asset.id ? editForm.asset_type : asset.asset_type,
        value: nextValue,
        recorded_date: snapshotForm.recorded_date,
        notes: snapshotForm.notes,
      })
      await load()
      cancelSnapshot()
    } catch (error) {
      setErrorMsg(error?.response?.data?.detail || 'Kunne ikke registrere ny verdi.')
    }
  }

  const positiveAssets = data?.assets.filter(asset => asset.value >= 0) ?? []
  const liabilities = data?.assets.filter(asset => asset.value < 0) ?? []

  const totalAssets = positiveAssets.reduce((sum, asset) => sum + asset.value, 0)
  const totalDebt = liabilities.reduce((sum, asset) => sum + asset.value, 0)
  const netWorth = totalAssets + totalDebt

  const byType = ASSET_TYPES
    .map(type => ({
      ...type,
      total: positiveAssets
        .filter(asset => asset.asset_type === type.value)
        .reduce((sum, asset) => sum + asset.value, 0),
    }))
    .filter(type => type.total > 0)

  const chartData = history.map(point => ({
    date: shortDate(point.date),
    isoDate: point.date,
    Eiendeler: Math.round(point.assets),
    Gjeld: Math.round(point.debt),
    Netto: Math.round(point.total),
  }))
  const seriesConfig = {
    Eiendeler: { color: '#22c55e', label: 'Eiendeler' },
    Gjeld: { color: '#ef4444', label: 'Gjeld' },
    Netto: { color: '#3b82f6', label: 'Netto' },
  }
  const filteredChartData = filterChartData(chartData, selectedRange)

  const selectedHistoryAsset = data?.assets.find(asset => asset.name === selectedHistoryName) || null
  const selectedHistory = selectedHistoryName ? assetHistories[selectedHistoryName] || [] : []
  const selectedChartData = selectedHistory.map(entry => ({
    date: shortDate(entry.date),
    value: Math.round(selectedHistoryAsset?.value < 0 ? Math.abs(entry.value) : entry.value),
  }))

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

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-6 text-sm">
          {errorMsg}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <KpiCard tone="green" label="Eiendeler" value={formatNOK(totalAssets)} />
          <KpiCard tone="red" label="Gjeld" value={formatNOK(Math.abs(totalDebt))} />
          <KpiCard tone={netWorth >= 0 ? 'blue' : 'orange'} label="Nettoformue" value={formatNOK(netWorth)} />
        </div>
      )}

      {filteredChartData.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <h2 className="text-base font-semibold text-gray-800">Utvikling over tid</h2>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
                {Object.keys(seriesConfig).map(series => (
                  <button
                    key={series}
                    type="button"
                    onClick={() => setSelectedSeries(series)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      selectedSeries === series
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {seriesConfig[series].label}
                  </button>
                ))}
              </div>
              <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
                {RANGE_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSelectedRange(option.value)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      selectedRange === option.value
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={filteredChartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 12, fill: '#94a3b8' }} width={52} />
              <Tooltip formatter={(value) => formatNOK(value)} />
              <Legend />
              <Line
                type="monotone"
                dataKey={selectedSeries}
                name={seriesConfig[selectedSeries].label}
                stroke={seriesConfig[selectedSeries].color}
                strokeWidth={2}
                dot={{ r: 4 }}
                strokeDasharray={selectedSeries === 'Netto' ? '5 3' : undefined}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {byType.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {byType.map(type => (
            <div key={type.value} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm text-gray-500 mb-1">{type.emoji} {type.label}</p>
              <p className="text-xl font-bold text-gray-800">{formatNOK(type.total)}</p>
            </div>
          ))}
        </div>
      )}

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
              onChange={e => setForm(current => ({ ...current, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={form.asset_type}
              onChange={e => setForm(current => ({ ...current, asset_type: e.target.value }))}
            >
              {ASSET_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.emoji} {type.label}</option>
              ))}
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
              onChange={e => setForm(current => ({ ...current, value: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Dato</label>
            <input
              required
              type="date"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={form.recorded_date}
              onChange={e => setForm(current => ({ ...current, recorded_date: e.target.value }))}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Notat (valgfritt)</label>
            <input
              type="text"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={form.notes}
              onChange={e => setForm(current => ({ ...current, notes: e.target.value }))}
            />
          </div>
          <div className="col-span-2 flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
              Avbryt
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              {saving ? 'Lagrer...' : 'Lagre'}
            </button>
          </div>
        </form>
      )}

      <AssetTable
        title="Eiendeler"
        amountLabel="Verdi"
        assets={positiveAssets}
        editId={editId}
        editForm={editForm}
        setEditForm={setEditForm}
        startEdit={startEdit}
        saveEdit={saveEdit}
        cancelEdit={cancelEdit}
        snapshotName={snapshotName}
        snapshotForm={snapshotForm}
        setSnapshotForm={setSnapshotForm}
        startSnapshot={startSnapshot}
        saveSnapshot={saveSnapshot}
        cancelSnapshot={cancelSnapshot}
        onDelete={handleDelete}
        onShowHistory={setSelectedHistoryName}
        assetHistories={assetHistories}
      />

      {selectedHistoryAsset && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Historikk: {selectedHistoryAsset.name}</h2>
              <p className="text-sm text-gray-500">{typeLabel(selectedHistoryAsset.asset_type).emoji} {typeLabel(selectedHistoryAsset.asset_type).label}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedHistoryName(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
          </div>

          {selectedChartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={selectedChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 12, fill: '#94a3b8' }} width={52} />
                <Tooltip formatter={(value) => formatNOK(value)} />
                <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 mb-4">Det finnes foreløpig bare ett registrert punkt for denne posten.</p>
          )}

          <div className="mt-5 space-y-2">
            {selectedHistory.slice().reverse().map(entry => (
              <div key={entry.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm text-gray-700">{formatDate(entry.date)}</p>
                  <p className="text-xs text-gray-400">{entry.notes || 'Ingen notat'}</p>
                </div>
                <p className={`text-sm font-semibold tabular-nums ${selectedHistoryAsset.value < 0 ? 'text-red-600' : 'text-green-700'}`}>
                  {formatAssetValue(selectedHistoryAsset, entry.value)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <AssetTable
        title="Gjeld"
        amountLabel="Beløp"
        assets={liabilities}
        editId={editId}
        editForm={editForm}
        setEditForm={setEditForm}
        startEdit={startEdit}
        saveEdit={saveEdit}
        cancelEdit={cancelEdit}
        snapshotName={snapshotName}
        snapshotForm={snapshotForm}
        setSnapshotForm={setSnapshotForm}
        startSnapshot={startSnapshot}
        saveSnapshot={saveSnapshot}
        cancelSnapshot={cancelSnapshot}
        onDelete={handleDelete}
        onShowHistory={setSelectedHistoryName}
        assetHistories={assetHistories}
      />
    </div>
  )
}

function AssetTable({
  title,
  amountLabel,
  assets,
  editId,
  editForm,
  setEditForm,
  startEdit,
  saveEdit,
  cancelEdit,
  snapshotName,
  snapshotForm,
  setSnapshotForm,
  startSnapshot,
  saveSnapshot,
  cancelSnapshot,
  onDelete,
  onShowHistory,
  assetHistories,
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">{title}</div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
          <tr>
            <th className="px-4 py-3 text-left">Navn</th>
            <th className="px-4 py-3 text-left">Type</th>
            <th className="px-4 py-3 text-right">{amountLabel}</th>
            <th className="px-4 py-3 text-right">Endring</th>
            <th className="px-4 py-3 text-left">Dato</th>
            <th className="px-4 py-3 text-left">Notat</th>
            <th className="px-4 py-3 text-right">Handlinger</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {assets.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                Ingen poster ennå.
              </td>
            </tr>
          ) : assets.map(asset => {
            const type = typeLabel(asset.asset_type)
            const delta = getDelta(asset, assetHistories[asset.name])
            const snapshotEditing = snapshotName === asset.name

            return (
              <tr key={asset.id} className="hover:bg-gray-50 align-top">
                <td className="px-4 py-3 font-medium text-gray-800">{asset.name}</td>
                <td className="px-4 py-3 text-gray-500">
                  {editId === asset.id ? (
                    <select
                      className="border border-gray-200 rounded-lg px-2 py-1 text-sm bg-white"
                      value={editForm.asset_type}
                      onChange={e => setEditForm(current => ({ ...current, asset_type: e.target.value }))}
                    >
                      {ASSET_TYPES.map(assetType => (
                        <option key={assetType.value} value={assetType.value}>
                          {assetType.emoji} {assetType.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <>{type.emoji} {type.label}</>
                  )}
                </td>
                <td className={`px-4 py-3 text-right font-semibold tabular-nums ${asset.value < 0 ? 'text-red-600' : 'text-green-700'}`}>
                  {formatAssetValue(asset, asset.value)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {delta ? (
                    <span className={delta.positive ? 'text-green-700' : 'text-red-600'}>
                      {delta.prefix} {formatNOK(delta.amount)}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500">{formatDate(asset.recorded_date)}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {editId === asset.id ? (
                    <input
                      type="text"
                      className="border border-gray-200 rounded-lg px-2 py-1 text-sm w-full min-w-40 text-gray-700 bg-white"
                      value={editForm.notes}
                      onChange={e => setEditForm(current => ({ ...current, notes: e.target.value }))}
                    />
                  ) : (
                    asset.notes || '—'
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end items-center gap-2 flex-wrap">
                    {snapshotEditing ? (
                      <>
                        <input
                          type="number"
                          step="0.01"
                          className="border border-gray-200 rounded-lg px-2 py-1 text-sm w-28 text-right"
                          value={snapshotForm.value}
                          onChange={e => setSnapshotForm(current => ({ ...current, value: e.target.value }))}
                        />
                        <input
                          type="date"
                          className="border border-gray-200 rounded-lg px-2 py-1 text-sm"
                          value={snapshotForm.recorded_date}
                          onChange={e => setSnapshotForm(current => ({ ...current, recorded_date: e.target.value }))}
                        />
                        <button type="button" onClick={() => saveSnapshot(asset)} className="text-green-600 hover:text-green-700 transition-colors">
                          ✓
                        </button>
                        <button type="button" onClick={cancelSnapshot} className="text-gray-400 hover:text-gray-600 transition-colors">
                          <X size={15} />
                        </button>
                      </>
                    ) : editId === asset.id ? (
                      <>
                        <button type="button" onClick={() => saveEdit(asset.id)} className="text-green-600 hover:text-green-700 transition-colors">
                          ✓
                        </button>
                        <button type="button" onClick={cancelEdit} className="text-gray-400 hover:text-gray-600 transition-colors">
                          <X size={15} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => startSnapshot(asset)} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">
                          Oppdater verdi
                        </button>
                        <button type="button" onClick={() => onShowHistory(asset.name)} className="text-gray-300 hover:text-indigo-500 transition-colors" title="Se historikk">
                          <Clock3 size={15} />
                        </button>
                        <button type="button" onClick={() => startEdit(asset)} className="text-gray-300 hover:text-blue-500 transition-colors" title="Rediger type/notat">
                          <Pencil size={15} />
                        </button>
                        <button type="button" onClick={() => onDelete(asset.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                  {snapshotEditing && (
                    <input
                      type="text"
                      placeholder="Notat for ny verdi"
                      className="mt-2 border border-gray-200 rounded-lg px-2 py-1 text-sm w-full min-w-52 text-left"
                      value={snapshotForm.notes}
                      onChange={e => setSnapshotForm(current => ({ ...current, notes: e.target.value }))}
                    />
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function KpiCard({ tone, label, value }) {
  const tones = {
    green: 'bg-green-50 border-green-200 text-green-800 text-green-700',
    red: 'bg-red-50 border-red-200 text-red-800 text-red-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-800 text-blue-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-800 text-orange-700',
  }
  const [bg, border, valueColor, labelColor] = tones[tone].split(' ')
  return (
    <div className={`${bg} border ${border} rounded-xl p-5`}>
      <p className={`text-sm ${labelColor} mb-1`}>{label}</p>
      <p className={`text-3xl font-bold ${valueColor}`}>{value}</p>
    </div>
  )
}

function filterChartData(data, range) {
  if (range === 'all' || data.length <= 1) return data

  const monthsByRange = {
    '3m': 3,
    '6m': 6,
    '1y': 12,
  }
  const months = monthsByRange[range]
  if (!months) return data

  const last = data[data.length - 1]
  const endDate = new Date(last.isoDate)
  const startDate = new Date(endDate.getFullYear(), endDate.getMonth() - (months - 1), 1)

  return data.filter(point => new Date(point.isoDate) >= startDate)
}
