import { useEffect, useState } from 'react'
import { notifications as notificationApi } from '../utils/api'
import { formatDate, formatNOK } from '../utils/format'

function typeLabel(item) {
  if (item.type === 'asset_share') return 'Eiendel/gjeld'
  if (item.type === 'goal_share') return 'Mål'
  return 'Transaksjon'
}

export default function Notifications({ onCountChange }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [declineDrafts, setDeclineDrafts] = useState({})
  const [submittingId, setSubmittingId] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const [notificationItems, count] = await Promise.all([
        notificationApi.list(),
        notificationApi.count(),
      ])
      setItems(notificationItems)
      onCountChange?.(count.pending_count || 0)
    } catch (error) {
      setErrorMsg(error?.response?.data?.detail || 'Kunne ikke laste varsler.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function respond(item, action) {
    const message = declineDrafts[item.id] || ''
    if (action === 'decline' && !message.trim()) {
      setErrorMsg('Skriv en forklaring før du avslår.')
      return
    }
    setSubmittingId(`${item.type}:${item.id}:${action}`)
    setErrorMsg('')
    try {
      await notificationApi.respond(item.type, item.id, { action, message })
      setDeclineDrafts(current => ({ ...current, [item.id]: '' }))
      await load()
    } catch (error) {
      setErrorMsg(error?.response?.data?.detail || 'Kunne ikke oppdatere varsel.')
    } finally {
      setSubmittingId(null)
    }
  }

  async function withdraw(item) {
    setSubmittingId(`${item.type}:${item.id}:withdraw`)
    setErrorMsg('')
    try {
      await notificationApi.withdraw(item.type, item.id)
      await load()
    } catch (error) {
      setErrorMsg(error?.response?.data?.detail || 'Kunne ikke trekke tilbake forespørselen.')
    } finally {
      setSubmittingId(null)
    }
  }

  const incoming = items.filter(item => item.direction === 'incoming')
  const outgoing = items.filter(item => item.direction === 'outgoing')

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Varsler</h1>
        <p className="text-sm text-gray-500">Godkjenn eller avslå delingsforespørsler.</p>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-6 text-sm">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-400">Laster varsler...</div>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Mottatt</h2>
            <div className="space-y-4">
              {incoming.length === 0 ? (
                <p className="text-sm text-gray-400">Ingen ventende forespørsler.</p>
              ) : incoming.map(item => (
                <div key={`${item.type}:${item.id}`} className="rounded-xl border border-gray-200 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">{typeLabel(item)}</p>
                  <p className="text-sm font-semibold text-gray-900 mb-1">
                    {item.type === 'asset_share'
                      ? item.asset_name
                      : item.type === 'goal_share'
                        ? item.goal_name
                        : item.description}
                  </p>
                  <p className="text-sm text-gray-500 mb-3">
                    Fra {item.owner_name}
                    {item.type === 'transaction_share' && item.settlement_amount != null ? ` · Din andel ${formatNOK(item.settlement_amount)}` : ''}
                    {item.type === 'transaction_share' && item.transaction_date ? ` · ${formatDate(item.transaction_date)}` : ''}
                  </p>
                  <textarea
                    rows={3}
                    placeholder="Skriv forklaring hvis du avslår..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3"
                    value={declineDrafts[item.id] || ''}
                    onChange={e => setDeclineDrafts(current => ({ ...current, [item.id]: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => respond(item, 'accept')}
                      disabled={submittingId !== null}
                      className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      Godta
                    </button>
                    <button
                      type="button"
                      onClick={() => respond(item, 'decline')}
                      disabled={submittingId !== null}
                      className="px-4 py-2 rounded-lg border border-red-200 text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
                    >
                      Avslå
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Sendt</h2>
            <div className="space-y-4">
              {outgoing.length === 0 ? (
                <p className="text-sm text-gray-400">Ingen aktive eller avslåtte forespørsler.</p>
              ) : outgoing.map(item => (
                <div key={`${item.type}:${item.id}`} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-4 mb-1">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-400">{typeLabel(item)}</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {item.type === 'asset_share'
                          ? item.asset_name
                          : item.type === 'goal_share'
                            ? item.goal_name
                            : item.description}
                      </p>
                    </div>
                    <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${
                      item.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {item.status === 'pending' ? 'Venter på svar' : 'Avslått'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">
                    Til {item.shared_user_name}
                    {item.type === 'transaction_share' && item.settlement_amount != null ? ` · Andel ${formatNOK(item.settlement_amount)}` : ''}
                  </p>
                  {item.message && (
                    <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                      {item.message}
                    </p>
                  )}
                  {item.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => withdraw(item)}
                      disabled={submittingId !== null}
                      className="mt-3 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                    >
                      Trekk tilbake
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
