import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { assets as assetApi, goals as goalApi, notifications as notificationApi, transactions as txApi, users as userApi } from '../utils/api'
import { currentMonth, formatDate, formatMonth, formatNOK } from '../utils/format'

function statusLabel(status) {
  if (status === 'pending') return 'Venter'
  if (status === 'declined') return 'Avslått'
  return 'Godkjent'
}

function statusClass(status) {
  if (status === 'pending') return 'bg-yellow-100 text-yellow-800'
  if (status === 'declined') return 'bg-red-100 text-red-700'
  return 'bg-green-100 text-green-700'
}

function settlementStatusLabel(status) {
  if (status === 'paid') return 'Betalt'
  if (status === 'awaiting_approval') return 'Venter på godkjenning'
  if (status === 'overdue') return 'Forfalt'
  return 'Ubetalt'
}

function settlementStatusClass(status) {
  if (status === 'paid') return 'bg-green-100 text-green-700'
  if (status === 'awaiting_approval') return 'bg-blue-100 text-blue-700'
  if (status === 'overdue') return 'bg-red-100 text-red-700'
  return 'bg-yellow-100 text-yellow-800'
}

export default function SharedOverview() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [currentUser, setCurrentUser] = useState(null)
  const [goals, setGoals] = useState([])
  const [assets, setAssets] = useState([])
  const [transactions, setTransactions] = useState([])
  const [notifications, setNotifications] = useState([])
  const [submittingLeave, setSubmittingLeave] = useState(null)
  const [submittingSettlement, setSubmittingSettlement] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const [me, goalItems, assetResponse, txResponse, notificationItems] = await Promise.all([
      userApi.me(),
      goalApi.list(),
      assetApi.list(),
      txApi.list({ limit: 500 }),
      notificationApi.list(),
      ])
      setCurrentUser(me)
      setGoals(goalItems)
      setAssets(assetResponse.assets || [])
      setTransactions(txResponse.items || [])
      setNotifications(notificationItems)
    } catch (error) {
      setErrorMsg(error?.response?.data?.detail || 'Kunne ikke laste delte data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const acceptedGoals = useMemo(() => goals.filter(goal =>
    !goal.is_owner || (goal.shared_users || []).some(share => share.status === 'accepted')
  ), [goals])

  const acceptedAssets = useMemo(() => assets.filter(asset =>
    asset.is_shared_view || (asset.shared_users || []).some(share => share.status === 'accepted')
  ), [assets])

  const acceptedTransactions = useMemo(() => transactions.filter(tx =>
    tx.shared_role === 'participant' || tx.split?.status === 'accepted'
  ), [transactions])

  const pendingRequests = useMemo(() =>
    notifications.filter(item => item.status === 'pending'),
  [notifications])

  const declinedRequests = useMemo(() =>
    notifications.filter(item => item.status === 'declined'),
  [notifications])

  const owedToOthers = useMemo(() =>
    transactions
      .filter(tx => tx.shared_role === 'participant' && tx.split?.settlement_status !== 'paid')
      .reduce((sum, tx) => sum + (tx.split?.settlement_amount || 0), 0),
  [transactions])

  const owedFromOthers = useMemo(() =>
    transactions
      .filter(tx => tx.shared_role !== 'participant' && tx.split?.status === 'accepted' && tx.split?.settlement_status !== 'paid')
      .reduce((sum, tx) => sum + (tx.split?.settlement_amount || 0), 0),
  [transactions])

  const monthlyStatements = useMemo(() => {
    const month = currentMonth()
    const statements = []
    const grouped = new Map()
    transactions
      .filter(tx => tx.split?.status === 'accepted' && tx.split?.settlement_status !== 'paid' && String(tx.date).startsWith(month))
      .forEach(tx => {
        const isParticipant = tx.shared_role === 'participant'
        const name = isParticipant ? tx.split?.owner_name : tx.split?.participant_name
        const direction = isParticipant ? 'owes' : 'owed'
        const key = `${direction}:${name}`
        grouped.set(key, (grouped.get(key) || 0) + (tx.split?.settlement_amount || 0))
      })

    grouped.forEach((amount, key) => {
      const [direction, name] = key.split(':')
      if (!name) return
      statements.push(
        direction === 'owes'
          ? `${currentUser?.name || 'Du'} skylder ${name} ${formatNOK(amount)} denne måneden`
          : `${name} skylder ${currentUser?.name || 'deg'} ${formatNOK(amount)} denne måneden`,
      )
    })
    return statements
  }, [transactions, currentUser])

  async function handleLeave(type, id) {
    setSubmittingLeave(`${type}:${id}`)
    setErrorMsg('')
    try {
      await notificationApi.leave(type, id)
      await load()
    } catch (error) {
      setErrorMsg(error?.response?.data?.detail || 'Kunne ikke forlate delt post.')
    } finally {
      setSubmittingLeave(null)
    }
  }

  async function handleSettlement(splitId, paid) {
    setSubmittingSettlement(String(splitId))
    setErrorMsg('')
    try {
      await txApi.updateSplit(splitId, { paid })
      await load()
    } catch (error) {
      setErrorMsg(error?.response?.data?.detail || 'Kunne ikke oppdatere betalingsstatus.')
    } finally {
      setSubmittingSettlement(null)
    }
  }

  function goToGoal(goalId) {
    navigate(`/goals?goal=${goalId}`)
  }

  function goToAsset(asset) {
    navigate(`/assets?asset=${encodeURIComponent(`${asset.owner_user_id}::${asset.name}`)}`)
  }

  function goToTransaction(tx) {
    const params = new URLSearchParams({
      month: String(tx.date).slice(0, 7),
      search: tx.description,
    })
    navigate(`/transactions?${params.toString()}`)
  }

  function goToNotification(item) {
    if (item.type === 'goal_share' && item.goal_id) {
      goToGoal(item.goal_id)
      return
    }
    if (item.type === 'asset_share' && item.asset_name) {
      navigate('/assets')
      return
    }
    if (item.type === 'transaction_share' && item.transaction_date && item.description) {
      const params = new URLSearchParams({
        month: String(item.transaction_date).slice(0, 7),
        search: item.description,
      })
      navigate(`/transactions?${params.toString()}`)
      return
    }
    navigate('/notifications')
  }

  if (loading) {
    return <div className="p-8 text-sm text-gray-400">Laster delte ting...</div>
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mellom oss</h1>
        <p className="text-sm text-gray-500">Oversikt over delte mål, formuesposter, transaksjoner og forespørsler.</p>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-6 text-sm">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-4 gap-4 mb-6">
        <SummaryCard label="Delte mål" value={acceptedGoals.length} onClick={() => navigate('/goals')} />
        <SummaryCard label="Delte eiendeler/gjeld" value={acceptedAssets.length} onClick={() => navigate('/assets')} />
        <SummaryCard label="Delte transaksjoner" value={acceptedTransactions.length} onClick={() => navigate(`/transactions?${new URLSearchParams({ month: currentMonth() }).toString()}`)} />
        <SummaryCard label="Venter på svar" value={pendingRequests.length} onClick={() => navigate('/notifications')} />
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Skyldig mellom dere</h2>
          <div className="grid grid-cols-2 gap-4">
            <DebtCard
              title="Du skylder andre"
              value={formatNOK(owedToOthers)}
              tone="red"
              onClick={() => navigate(`/transactions?${new URLSearchParams({ month: currentMonth() }).toString()}`)}
            />
            <DebtCard
              title="Andre skylder deg"
              value={formatNOK(owedFromOthers)}
              tone="green"
              onClick={() => navigate(`/transactions?${new URLSearchParams({ month: currentMonth() }).toString()}`)}
            />
          </div>
          {monthlyStatements.length > 0 && (
            <div className="mt-4 space-y-2">
              {monthlyStatements.map(statement => (
                <div key={statement} className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
                  {statement}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Forespørsler</h2>
          <div className="space-y-3">
            {pendingRequests.length === 0 && declinedRequests.length === 0 ? (
              <p className="text-sm text-gray-400">Ingen aktive forespørsler akkurat nå.</p>
            ) : (
              [...pendingRequests, ...declinedRequests].slice(0, 6).map(item => (
                <button
                  key={`${item.type}:${item.id}`}
                  type="button"
                  onClick={() => goToNotification(item)}
                  className="w-full rounded-lg border border-gray-200 px-4 py-3 text-left hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {item.type === 'goal_share' ? item.goal_name : item.type === 'asset_share' ? item.asset_name : item.description}
                      </p>
                      <p className="text-xs text-gray-500">
                        {item.direction === 'incoming' ? `Fra ${item.owner_name}` : `Til ${item.shared_user_name}`}
                      </p>
                    </div>
                    <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${statusClass(item.status)}`}>
                      {statusLabel(item.status)}
                    </span>
                  </div>
                  {item.message && (
                    <p className="mt-2 text-sm text-red-700">{item.message}</p>
                  )}
                </button>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Delte mål</h2>
          <div className="space-y-3">
            {acceptedGoals.length === 0 ? (
              <p className="text-sm text-gray-400">Ingen delte mål ennå.</p>
            ) : acceptedGoals.map(goal => (
              <div
                key={goal.id}
                role="button"
                tabIndex={0}
                onClick={() => goToGoal(goal.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    goToGoal(goal.id)
                  }
                }}
                className="rounded-lg border border-gray-200 px-4 py-3 cursor-pointer hover:bg-gray-50"
              >
                <div className="flex items-center justify-between gap-4 mb-1">
                  <p className="text-sm font-medium text-gray-900">{goal.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs rounded-full bg-purple-50 px-2.5 py-1 text-purple-700">
                      {goal.is_owner ? 'Du eier' : `Eies av ${goal.owner_name}`}
                    </span>
                    {!goal.is_owner && goal.share_id && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleLeave('goal_share', goal.share_id)
                        }}
                        disabled={submittingLeave !== null}
                        className="text-xs rounded-lg border border-gray-200 px-2.5 py-1 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Forlat
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-2">{formatMonth(goal.start_month)} til {formatMonth(goal.target_month)}</p>
                <div className="text-sm text-gray-600">
                  {formatNOK(goal.current_amount)} av {formatNOK(goal.target_amount)}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Delte eiendeler og gjeld</h2>
          <div className="space-y-3">
            {acceptedAssets.length === 0 ? (
              <p className="text-sm text-gray-400">Ingen delte poster ennå.</p>
            ) : acceptedAssets.map(asset => (
              <div
                key={`${asset.owner_user_id}-${asset.name}`}
                role="button"
                tabIndex={0}
                onClick={() => goToAsset(asset)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    goToAsset(asset)
                  }
                }}
                className="rounded-lg border border-gray-200 px-4 py-3 cursor-pointer hover:bg-gray-50"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{asset.name}</p>
                    <p className="text-xs text-gray-500">
                      {asset.is_shared_view ? `Delt av ${asset.owner_name}` : 'Du eier'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${asset.value < 0 ? 'text-red-600' : 'text-green-700'}`}>
                      {formatNOK(asset.value)}
                    </p>
                    {asset.is_shared_view && asset.share_id && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleLeave('asset_share', asset.share_id)
                        }}
                        disabled={submittingLeave !== null}
                        className="mt-2 text-xs rounded-lg border border-gray-200 px-2.5 py-1 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Forlat
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Delte transaksjoner</h2>
          <div className="space-y-3">
            {acceptedTransactions.length === 0 ? (
              <p className="text-sm text-gray-400">Ingen godkjente delte transaksjoner ennå.</p>
            ) : acceptedTransactions.slice(0, 12).map(tx => (
              <div
                key={tx.id}
                role="button"
                tabIndex={0}
                onClick={() => goToTransaction(tx)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    goToTransaction(tx)
                  }
                }}
                className="rounded-lg border border-gray-200 px-4 py-3 cursor-pointer hover:bg-gray-50"
              >
                <div className="flex items-center justify-between gap-4 mb-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{tx.description}</p>
                  <span className="text-xs text-gray-500">{formatDate(tx.date)}</span>
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  {tx.shared_role === 'participant'
                    ? `Du skylder ${tx.split?.owner_name}`
                    : `${tx.split?.participant_name} skylder deg`}
                </p>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-gray-700">
                      {formatNOK(tx.split?.settlement_amount || 0)}
                    </div>
                    {tx.split?.due_date && (
                      <div className="text-xs text-gray-500 mt-1">Frist {formatDate(tx.split.due_date)}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {tx.split?.settlement_status && (
                      <span className={`text-xs rounded-full px-2.5 py-1 ${settlementStatusClass(tx.split.settlement_status)}`}>
                        {settlementStatusLabel(tx.split.settlement_status)}
                      </span>
                    )}
                    {tx.split?.id && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleSettlement(tx.split.id, tx.split.settlement_status !== 'paid')
                        }}
                        disabled={submittingSettlement !== null}
                        className="text-xs rounded-lg border border-gray-200 px-2.5 py-1 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {tx.split?.settlement_status === 'paid'
                          ? 'Marker ubetalt'
                          : tx.shared_role === 'participant'
                            ? tx.split?.settlement_status === 'awaiting_approval'
                              ? 'Trekk tilbake melding'
                              : 'Meld som betalt'
                            : tx.split?.settlement_status === 'awaiting_approval'
                              ? 'Godkjenn betalt'
                              : 'Marker som betalt'}
                      </button>
                    )}
                    {tx.shared_role === 'participant' && tx.split?.id && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleLeave('transaction_share', tx.split.id)
                        }}
                        disabled={submittingLeave !== null}
                        className="text-xs rounded-lg border border-gray-200 px-2.5 py-1 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Forlat
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, onClick }) {
  const className = `bg-white rounded-xl border border-gray-200 p-5 ${onClick ? 'cursor-pointer hover:bg-gray-50' : ''}`
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${className} text-left`}>
        <p className="text-sm text-gray-500 mb-1">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </button>
    )
  }
  return (
    <div className={className}>
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

function DebtCard({ title, value, tone, onClick }) {
  const className = `rounded-xl px-4 py-5 ${tone === 'red' ? 'bg-red-50' : 'bg-green-50'} ${onClick ? 'cursor-pointer hover:opacity-90 text-left' : ''}`
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        <p className="text-sm text-gray-600 mb-1">{title}</p>
        <p className={`text-2xl font-bold ${tone === 'red' ? 'text-red-700' : 'text-green-700'}`}>{value}</p>
      </button>
    )
  }
  return (
    <div className={className}>
      <p className="text-sm text-gray-600 mb-1">{title}</p>
      <p className={`text-2xl font-bold ${tone === 'red' ? 'text-red-700' : 'text-green-700'}`}>{value}</p>
    </div>
  )
}
