import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { assets as assetApi, categories as categoryApi, goals as goalApi, users as userApi } from '../utils/api'
import { formatMonth, formatNOK } from '../utils/format'
import { Pencil, Plus, Target, Trash2 } from 'lucide-react'

const GOAL_TYPES = [
  { value: 'savings', label: 'Sparemål' },
  { value: 'debt_reduction', label: 'Gjeldsmål' },
  { value: 'expense_reduction', label: 'Redusere utgifter til kategori' },
]

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function addMonths(monthStr, monthsToAdd) {
  const [year, month] = monthStr.split('-').map(Number)
  const date = new Date(year, month - 1 + monthsToAdd, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthDiff(fromMonth, toMonth) {
  const [fromYear, fromMon] = fromMonth.split('-').map(Number)
  const [toYear, toMon] = toMonth.split('-').map(Number)
  return (toYear - fromYear) * 12 + (toMon - fromMon)
}

function defaultForm() {
  const startMonth = currentMonth()
  return {
    name: '',
    goal_type: 'savings',
    target_amount: '',
    current_amount: '0',
    monthly_target: '',
    start_month: startMonth,
    target_month: addMonths(startMonth, 3),
    category_id: '',
    linked_asset_names: [],
    shared_user_ids: [],
    notes: '',
  }
}

function goalTypeLabel(goalType) {
  return GOAL_TYPES.find(goal => goal.value === goalType)?.label || goalType
}

function sortUsers(users) {
  return [...users].sort((a, b) => {
    if (Boolean(a.is_trusted) !== Boolean(b.is_trusted)) return a.is_trusted ? -1 : 1
    return a.name.localeCompare(b.name, 'nb')
  })
}

function labelsFor(goalType) {
  if (goalType === 'debt_reduction') {
    return {
      targetAmount: 'Hvor mye gjeld vil du betale ned totalt?',
      currentAmount: 'Hvor mye er allerede betalt ned?',
      monthlyTarget: 'Hvor mye vil du betale ned per måned?',
      progress: 'Nedbetalt så langt',
    }
  }
  if (goalType === 'expense_reduction') {
    return {
      targetAmount: 'Hvor mye vil du redusere totalt?',
      currentAmount: 'Hvor mye har du redusert så langt?',
      monthlyTarget: 'Ønsket maks per måned',
      progress: 'Redusert så langt',
    }
  }
  return {
    targetAmount: 'Hvor mye vil du spare totalt?',
    currentAmount: 'Hvor mye er allerede spart?',
    monthlyTarget: 'Hvor mye vil du spare per måned?',
    progress: 'Spart så langt',
  }
}

export default function Goals() {
  const [searchParams] = useSearchParams()
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [assets, setAssets] = useState([])
  const [users, setUsers] = useState([])
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(defaultForm())
  const [shareSearch, setShareSearch] = useState('')
  const [editingGoalId, setEditingGoalId] = useState(null)
  const selectedGoalId = searchParams.get('goal')

  const load = () => {
    setLoading(true)
    return Promise.all([
      goalApi.list(),
      categoryApi.list(),
      assetApi.list(),
      userApi.list(),
      userApi.me(),
    ]).then(([goals, cats, assetResponse, userList, me]) => {
      setItems(goals)
      setCategories(cats.filter(cat => cat.category_type === 'expense'))
      setAssets(assetResponse.assets || [])
      setUsers(sortUsers(userList.filter(user => user.id !== me.id)))
      setCurrentUser(me)
    }).finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setErrorMsg('')
    try {
      const payload = {
        ...form,
        target_amount: parseFloat(form.target_amount),
        current_amount: parseFloat(form.current_amount || '0'),
        monthly_target: form.monthly_target ? parseFloat(form.monthly_target) : null,
        category_id: form.goal_type === 'expense_reduction' && form.category_id ? Number(form.category_id) : null,
        linked_asset_names: form.goal_type !== 'expense_reduction' ? form.linked_asset_names : [],
        shared_user_ids: form.shared_user_ids,
      }

      if (editingGoalId) {
        await goalApi.update(editingGoalId, payload)
      } else {
        await goalApi.create(payload)
      }

      setForm(defaultForm())
      setShareSearch('')
      setEditingGoalId(null)
      setShowForm(false)
      await load()
    } catch (error) {
      setErrorMsg(error?.response?.data?.detail || (editingGoalId ? 'Kunne ikke oppdatere mål.' : 'Kunne ikke lagre mål.'))
    } finally {
      setSaving(false)
    }
  }

  async function updateProgress(goal, value) {
    const currentAmount = parseFloat(value)
    if (Number.isNaN(currentAmount)) return
    setErrorMsg('')
    try {
      await goalApi.update(goal.id, { current_amount: currentAmount })
      await load()
    } catch (error) {
      setErrorMsg(error?.response?.data?.detail || 'Kunne ikke oppdatere fremdrift.')
    }
  }

  async function handleDelete(id) {
    if (!confirm('Slett dette målet?')) return
    setErrorMsg('')
    try {
      await goalApi.delete(id)
      await load()
    } catch (error) {
      setErrorMsg(error?.response?.data?.detail || 'Kunne ikke slette mål.')
    }
  }

  const totalTarget = items.reduce((sum, item) => sum + item.target_amount, 0)
  const totalProgress = items.reduce((sum, item) => sum + item.current_amount, 0)
  const activeLabels = labelsFor(form.goal_type)
  const usesAssetTracking = form.goal_type === 'savings' || form.goal_type === 'debt_reduction'
  const suggestedShareUserIds = [...new Set(items.flatMap(item => item.shared_user_ids || []))]
  const suggestedUsers = users.filter(user => suggestedShareUserIds.includes(user.id))
  const searchableUsers = users.filter(user => !suggestedShareUserIds.includes(user.id))
  const normalizedShareSearch = shareSearch.trim().toLowerCase()
  const searchedUsers = normalizedShareSearch
    ? searchableUsers.filter(user =>
        user.name.toLowerCase().includes(normalizedShareSearch)
        || user.email.toLowerCase().includes(normalizedShareSearch))
    : []

  function toggleLinkedAsset(assetName) {
    setForm(current => {
      const alreadySelected = current.linked_asset_names.includes(assetName)
      return {
        ...current,
        linked_asset_names: alreadySelected
          ? current.linked_asset_names.filter(name => name !== assetName)
          : [...current.linked_asset_names, assetName],
      }
    })
  }

  function toggleSharedUser(userId) {
    setForm(current => {
      const alreadySelected = current.shared_user_ids.includes(userId)
      return {
        ...current,
        shared_user_ids: alreadySelected
          ? current.shared_user_ids.filter(id => id !== userId)
          : [...current.shared_user_ids, userId],
      }
    })
  }

  function startEdit(goal) {
    setEditingGoalId(goal.id)
    setShareSearch('')
    setForm({
      name: goal.name,
      goal_type: goal.goal_type,
      target_amount: String(goal.target_amount),
      current_amount: String(goal.manual_current_amount ?? goal.current_amount ?? 0),
      monthly_target: goal.monthly_target != null ? String(goal.monthly_target) : '',
      start_month: goal.start_month,
      target_month: goal.target_month,
      category_id: goal.category_id ? String(goal.category_id) : '',
      linked_asset_names: goal.linked_asset_names || [],
      shared_user_ids: goal.shared_user_ids || [],
      notes: goal.notes || '',
    })
    setShowForm(true)
  }

  function cancelForm() {
    setForm(defaultForm())
    setShareSearch('')
    setEditingGoalId(null)
    setShowForm(false)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mål</h1>
          <p className="text-sm text-gray-500">Sparemål, gjeldsmål og mål for å redusere utgifter</p>
        </div>
        <button
          onClick={() => {
            if (showForm && !editingGoalId) {
              cancelForm()
              return
            }
            setEditingGoalId(null)
            setForm(defaultForm())
            setShareSearch('')
            setShowForm(true)
          }}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
        >
          <Plus size={16} /> Nytt mål
        </button>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-6 text-sm">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-6">
        <SummaryCard label="Målbeløp totalt" value={formatNOK(totalTarget)} />
        <SummaryCard label="Registrert fremdrift" value={formatNOK(totalProgress)} />
        <SummaryCard label="Gjenstår" value={formatNOK(Math.max(totalTarget - totalProgress, 0))} />
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 mb-6 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Måltype</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={form.goal_type}
              onChange={e => setForm(f => ({ ...f, goal_type: e.target.value, category_id: '', linked_asset_names: [] }))}
            >
              {GOAL_TYPES.map(goalType => (
                <option key={goalType.value} value={goalType.value}>{goalType.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Navn på mål</label>
            <input
              required
              type="text"
              placeholder="f.eks. Spar 10 000 kr innen juli"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          {form.goal_type === 'expense_reduction' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Kategori</label>
              <select
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={form.category_id}
                onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
              >
                <option value="">Velg kategori...</option>
                {categories.map(category => (
                  <option key={category.id} value={category.id}>{category.icon} {category.name}</option>
                ))}
              </select>
            </div>
          )}
          {usesAssetTracking && (
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-2">
                Koble til konto eller gjeldspost
              </label>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-gray-200 p-3 bg-gray-50">
                {assets.length === 0 ? (
                  <p className="text-sm text-gray-400">Ingen eiendeler eller gjeld registrert ennå.</p>
                ) : assets.map(asset => (
                  <label
                    key={asset.name}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={form.linked_asset_names.includes(asset.name)}
                      onChange={() => toggleLinkedAsset(asset.name)}
                    />
                    <span className="flex-1 text-gray-700">{asset.name}</span>
                    <span className="text-xs text-gray-400">{formatNOK(asset.value)}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Sparemål henter fremdrift fra valgt konto. Gjeldsmål bruker valgt gjeld som grunnlag og måler nedbetaling automatisk.
              </p>
            </div>
          )}
          {users.length > 0 && (
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-2">Del målet med andre brukere</label>
              <div className="rounded-xl border border-gray-200 p-3 bg-gray-50 space-y-3">
                {suggestedUsers.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Foreslått basert på tidligere deling</p>
                    <div className="grid grid-cols-2 gap-2">
                      {suggestedUsers.map(user => (
                        <label key={user.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={form.shared_user_ids.includes(user.id)}
                            onChange={() => toggleSharedUser(user.id)}
                          />
                          <span className="flex-1 text-gray-700">{user.name}</span>
                          <span className="text-xs text-gray-400">{user.email}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">Søk etter annen bruker</label>
                  <input
                    type="text"
                    placeholder="Søk på navn eller e-post..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                    value={shareSearch}
                    onChange={e => setShareSearch(e.target.value)}
                  />
                </div>

                {normalizedShareSearch && (
                  <div className="grid grid-cols-2 gap-2">
                    {searchedUsers.length === 0 ? (
                      <p className="text-sm text-gray-400">Ingen brukere funnet.</p>
                    ) : searchedUsers.map(user => (
                      <label key={user.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.shared_user_ids.includes(user.id)}
                          onChange={() => toggleSharedUser(user.id)}
                        />
                        <span className="flex-1 text-gray-700">{user.name}</span>
                        <span className="text-xs text-gray-400">{user.email}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Startmåned</label>
            <input
              required
              type="month"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={form.start_month}
              onChange={e => setForm(f => ({ ...f, start_month: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Målmåned</label>
            <input
              required
              type="month"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={form.target_month}
              onChange={e => setForm(f => ({ ...f, target_month: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{activeLabels.targetAmount}</label>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={form.target_amount}
              onChange={e => setForm(f => ({ ...f, target_amount: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{activeLabels.currentAmount}</label>
            <input
              type="number"
              min="0"
              step="0.01"
              disabled={usesAssetTracking && form.linked_asset_names.length > 0}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={form.current_amount}
              onChange={e => setForm(f => ({ ...f, current_amount: e.target.value }))}
            />
            {usesAssetTracking && form.linked_asset_names.length > 0 && (
              <p className="text-xs text-gray-400 mt-1">Fremdrift beregnes automatisk fra valgte koblinger.</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{activeLabels.monthlyTarget}</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={form.monthly_target}
              onChange={e => setForm(f => ({ ...f, monthly_target: e.target.value }))}
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
            <button
              type="button"
              onClick={cancelForm}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Avbryt
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? 'Lagrer...' : editingGoalId ? 'Lagre endringer' : 'Lagre mål'}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            Laster...
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <Target size={28} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 mb-1">Ingen mål registrert ennå.</p>
            <p className="text-sm text-gray-400">Opprett sparemål, gjeldsmål eller mål for å redusere utgifter i en kategori.</p>
          </div>
        ) : items.map(item => {
          const progressPct = item.target_amount > 0
            ? Math.min((item.current_amount / item.target_amount) * 100, 100)
            : 0
          const remaining = Math.max(item.target_amount - item.current_amount, 0)
          const planMonths = Math.max(monthDiff(item.start_month, item.target_month) + 1, 1)
          const monthlyPlan = item.monthly_target ?? (item.target_amount / planMonths)
          const itemLabels = labelsFor(item.goal_type)

          return (
            <div
              key={item.id}
              id={`goal-${item.id}`}
              className={`bg-white rounded-xl border p-5 ${
                String(item.id) === selectedGoalId ? 'border-green-400 ring-2 ring-green-100' : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-semibold text-gray-900">{item.name}</h2>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                      {goalTypeLabel(item.goal_type)}
                    </span>
                    {item.category_name && (
                      <span className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded-full">
                        {item.category_name}
                      </span>
                    )}
                    {item.linked_asset_names?.map(assetName => (
                      <span key={assetName} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                        {assetName}
                      </span>
                    ))}
                    {item.shared_users?.map(share => (
                      <span key={share.user_id} className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded-full">
                        Delt med {share.name}{share.status === 'pending' ? ' (venter)' : ''}
                      </span>
                    ))}
                    {!item.is_owner && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                        Delt av {item.owner_name}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    {formatMonth(item.start_month)} til {formatMonth(item.target_month)}
                  </p>
                  {item.notes && (
                    <p className="text-sm text-gray-400 mt-1">{item.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {item.is_owner && (
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      <Pencil size={13} />
                      Juster
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(item.id)}
                    disabled={!item.is_owner}
                    className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-30"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <GoalMetric label="Målbeløp" value={formatNOK(item.target_amount)} />
                <GoalMetric label={itemLabels.progress} value={formatNOK(item.current_amount)} />
                <GoalMetric label="Plan per måned" value={formatNOK(monthlyPlan)} />
              </div>

              {item.goal_type === 'savings' && item.linked_asset_names?.length > 0 && (
                <div className="mb-4 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  Målet følger {item.linked_asset_names.length > 1 ? 'valgte kontoer' : 'valgt konto'} automatisk.
                  Nåværende saldo: {formatNOK(item.linked_asset_total || 0)}
                </div>
              )}

              {item.goal_type === 'debt_reduction' && item.linked_asset_names?.length > 0 && (
                <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Målet følger valgt gjeld automatisk.
                  Startgjeld: {formatNOK(item.baseline_amount || 0)}.
                  Nåværende gjeld: {formatNOK(item.linked_debt_balance || 0)}
                </div>
              )}

              <div className="mb-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-500">Fremdrift</span>
                  <span className="font-medium text-gray-700">{progressPct.toFixed(0)}%</span>
                </div>
                <div className="bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400 mt-2">
                  <span>Gjenstår {formatNOK(remaining)}</span>
                  <span>{planMonths} måneder i planen</span>
                </div>
              </div>

              {(!item.is_owner || (item.linked_asset_names?.length > 0 && item.goal_type !== 'expense_reduction')) ? null : (
                <div className="flex items-end gap-3 flex-wrap">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{itemLabels.progress}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={item.manual_current_amount ?? item.current_amount}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-44"
                      onKeyDown={e => e.key === 'Enter' && updateProgress(item, e.currentTarget.value)}
                      onBlur={e => updateProgress(item, e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SummaryCard({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

function GoalMetric({ label, value }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
    </div>
  )
}
