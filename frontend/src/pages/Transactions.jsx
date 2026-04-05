import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { transactions as txApi, accounts as accApi, categories as catApi, users as userApi } from '../utils/api'
import { Plus } from 'lucide-react'
import { formatNOK, formatDate } from '../utils/format'
import { getActiveMonth, setActiveMonth } from '../utils/month'
import { Upload, RefreshCw, Search } from 'lucide-react'
import VippsPayButton from '../components/VippsPayButton'

function sortUsers(users) {
  return [...users].sort((a, b) => {
    if (Boolean(a.is_trusted) !== Boolean(b.is_trusted)) return a.is_trusted ? -1 : 1
    return a.name.localeCompare(b.name, 'nb')
  })
}

function defaultDueDate(dateString) {
  const date = new Date(dateString)
  date.setDate(date.getDate() + 14)
  return date.toISOString().slice(0, 10)
}

function settlementTone(status) {
  if (status === 'paid') return 'text-green-700 bg-green-50'
  if (status === 'awaiting_approval') return 'text-blue-700 bg-blue-50'
  if (status === 'overdue') return 'text-red-700 bg-red-50'
  return 'text-yellow-800 bg-yellow-50'
}

export default function Transactions() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [txs, setTxs] = useState([])
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [users, setUsers] = useState([])
  const [currentUser, setCurrentUser] = useState(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState(null)

  const [filters, setFilters] = useState({
    account_id: searchParams.get('account_id') || '',
    category_id: searchParams.get('category_id') || '',
    month: searchParams.get('month') || getActiveMonth(),
    search: searchParams.get('search') || '',
    uncategorized: searchParams.get('uncategorized') === 'true',
  })

  const [selectedAccount, setSelectedAccount] = useState('')
  const [showNewAccount, setShowNewAccount] = useState(false)
  const [newAccount, setNewAccount] = useState({ name: '', bank: 'DNB', account_type: 'checking' })
  const [splitDrafts, setSplitDrafts] = useState({})
  const [shareOpenByTx, setShareOpenByTx] = useState({})
  const [shareSearchByTx, setShareSearchByTx] = useState({})
  const fileRef = useRef()

  useEffect(() => {
    Promise.all([accApi.list(), catApi.list(), userApi.list(), userApi.me()]).then(([a, c, userList, me]) => {
      setAccounts(a)
      setCategories(c)
      setUsers(sortUsers(userList.filter(user => user.id !== me.id)))
      setCurrentUser(me)
    })
  }, [])

  useEffect(() => {
    if (filters.month) {
      setActiveMonth(filters.month)
    }
  }, [filters.month])

  useEffect(() => {
    setLoading(true)
    const params = {}
    if (filters.account_id) params.account_id = filters.account_id
    if (filters.category_id) params.category_id = filters.category_id
    if (filters.month) params.month = filters.month
    if (filters.search) params.search = filters.search
    if (filters.uncategorized) params.uncategorized = true

    txApi.list(params).then((data) => {
      setTxs(data.items)
      setTotal(data.total)
    }).finally(() => setLoading(false))
  }, [filters])

  useEffect(() => {
    setSplitDrafts(prev => {
      const next = { ...prev }
      txs.forEach(tx => {
        next[tx.id] = next[tx.id] || {
          participant_user_id: tx.split?.participant_user_id ? String(tx.split.participant_user_id) : '',
          share_percent: tx.split?.share_percent ? String(tx.split.share_percent) : '50',
          due_date: tx.split?.due_date || defaultDueDate(tx.date),
        }
      })
      return next
    })
  }, [txs])

  useEffect(() => {
    setShareOpenByTx(prev => {
      const next = { ...prev }
      txs.forEach(tx => {
        if (tx.split) {
          next[tx.id] = true
        } else if (!(tx.id in next)) {
          next[tx.id] = false
        }
      })
      return next
    })
  }, [txs])

  useEffect(() => {
    const params = {}
    if (filters.account_id) params.account_id = filters.account_id
    if (filters.category_id) params.category_id = filters.category_id
    if (filters.month) params.month = filters.month
    if (filters.search) params.search = filters.search
    if (filters.uncategorized) params.uncategorized = 'true'
    setSearchParams(params, { replace: true })
  }, [filters, setSearchParams])

  async function handleImport(e) {
    const file = e.target.files[0]
    if (!file || !selectedAccount) {
      setImportMsg({ type: 'error', text: 'Velg konto først.' })
      return
    }
    setImporting(true)
    setImportMsg(null)
    try {
      const result = await txApi.import(selectedAccount, file)
      const errorCount = result.errors?.length ?? 0
      setImportMsg({
        type: errorCount > 0 ? 'error' : 'success',
        text:
          errorCount > 0
            ? `Importert ${result.imported} transaksjoner, ${result.skipped_duplicates} duplikater hoppet over, ${errorCount} rader feilet.`
            : `Importert ${result.imported} transaksjoner, ${result.skipped_duplicates} duplikater hoppet over.`,
      })
      setFilters(f => ({ ...f })) // trigger reload
    } catch (error) {
      const detail = error?.response?.data?.detail
      setImportMsg({
        type: 'error',
        text: detail || 'Import feilet. Sjekk filen og prøv igjen.',
      })
    } finally {
      setImporting(false)
      fileRef.current.value = ''
    }
  }

  async function handleCategoryChange(txId, categoryId) {
    await txApi.update(txId, { category_id: categoryId === '' ? null : Number(categoryId) })
    setTxs(prev => prev.map(t => t.id === txId ? { ...t, category_id: categoryId } : t))
  }

  async function applyRules() {
    const result = await txApi.applyRules({ overwrite: false })
    setImportMsg({ type: 'success', text: `${result.updated} transaksjoner auto-kategorisert.` })
    setFilters(f => ({ ...f }))
  }

  async function handleCreateAccount(e) {
    e.preventDefault()
    const created = await accApi.create(newAccount)
    const updated = await accApi.list()
    setAccounts(updated)
    setSelectedAccount(String(created.id))
    setNewAccount({ name: '', bank: 'DNB', account_type: 'checking' })
    setShowNewAccount(false)
  }

  function updateSplitDraft(txId, patch) {
    setSplitDrafts(current => ({
      ...current,
      [txId]: {
        ...(current[txId] || {}),
        ...patch,
      },
    }))
  }

  async function saveSplit(tx) {
    const draft = splitDrafts[tx.id] || {}
    const userId = draft.participant_user_id ? Number(draft.participant_user_id) : null
    const sharePercent = Number(draft.share_percent || '50')
    await txApi.setSplit(tx.id, {
      participant_user_id: userId,
      share_ratio: sharePercent / 100,
      due_date: draft.due_date || null,
      note: 'Halvpart av fellesutgift',
    })
    setFilters(f => ({ ...f }))
  }

  async function setShareEnabled(tx, enabled) {
    if (!enabled) {
      updateSplitDraft(tx.id, { participant_user_id: '' })
      setShareOpenByTx(current => ({ ...current, [tx.id]: false }))
      if (tx.split?.id) {
        await txApi.setSplit(tx.id, { participant_user_id: null, share_ratio: 0.5, note: null })
        setFilters(f => ({ ...f }))
      }
      return
    }
    setShareOpenByTx(current => ({ ...current, [tx.id]: true }))
  }

  async function togglePaid(splitId, paid) {
    await txApi.updateSplit(splitId, { paid })
    setFilters(f => ({ ...f }))
  }

  const previousSharedUserIds = [...new Set(
    txs
      .map(tx => tx.split?.participant_user_id)
      .filter(Boolean),
  )]
  const suggestedUsers = users.filter(user => previousSharedUserIds.includes(user.id))
  const userById = Object.fromEntries(users.map(u => [u.id, u]))

  function searchedUsers(txId) {
    const query = (shareSearchByTx[txId] || '').trim().toLowerCase()
    if (!query) return []
    return users.filter(user =>
      user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query),
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Transaksjoner</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={applyRules}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            <RefreshCw size={15} /> Bruk regler
          </button>
        </div>
      </div>

      {/* Import section */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3 flex items-center gap-4 flex-wrap">
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          value={selectedAccount}
          onChange={e => setSelectedAccount(e.target.value)}
        >
          <option value="">Velg konto...</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <label className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors
          ${importing ? 'bg-gray-100 text-gray-400' : 'bg-green-600 text-white hover:bg-green-700'}`}>
          <Upload size={15} />
          {importing ? 'Importerer...' : 'Last opp DNB CSV'}
          <input
            type="file"
            accept=".csv"
            className="hidden"
            ref={fileRef}
            onChange={handleImport}
            disabled={importing}
          />
        </label>
        <button
          onClick={() => setShowNewAccount(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
        >
          <Plus size={14} /> Ny konto
        </button>
        {importMsg && (
          <span className={`text-sm ${importMsg.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>
            {importMsg.text}
          </span>
        )}
      </div>

      {/* New account form */}
      {showNewAccount && (
        <form onSubmit={handleCreateAccount} className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Kontonavn</label>
            <input
              required type="text" placeholder="f.eks. DNB Brukskonto"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white w-48"
              value={newAccount.name}
              onChange={e => setNewAccount(a => ({ ...a, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Bank</label>
            <input
              type="text" placeholder="DNB"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white w-28"
              value={newAccount.bank}
              onChange={e => setNewAccount(a => ({ ...a, bank: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <select
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
              value={newAccount.account_type}
              onChange={e => setNewAccount(a => ({ ...a, account_type: e.target.value }))}
            >
              <option value="checking">Brukskonto</option>
              <option value="savings">Sparekonto</option>
              <option value="credit">Kredittkort</option>
            </select>
          </div>
          <button type="submit" className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">Opprett</button>
          <button type="button" onClick={() => setShowNewAccount(false)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Avbryt</button>
        </form>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
          <input
            type="text"
            placeholder="Søk..."
            className="pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm w-48"
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          />
        </div>
        <input
          type="month"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          value={filters.month}
          onChange={e => setFilters(f => ({ ...f, month: e.target.value }))}
        />
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          value={filters.account_id}
          onChange={e => setFilters(f => ({ ...f, account_id: e.target.value }))}
        >
          <option value="">Alle kontoer</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          value={filters.category_id}
          onChange={e => setFilters(f => ({ ...f, category_id: e.target.value }))}
        >
          <option value="">Alle kategorier</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.uncategorized}
            onChange={e => setFilters(f => ({ ...f, uncategorized: e.target.checked }))}
          />
          Kun ukategorisert
        </label>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 text-sm text-gray-500">
          {total} transaksjoner
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Dato</th>
              <th className="px-4 py-3 text-left">Beskrivelse</th>
              <th className="px-4 py-3 text-left">Konto</th>
              <th className="px-4 py-3 text-right">Beløp</th>
          <th className="px-4 py-3 text-left">Kategori</th>
          <th className="px-4 py-3 text-left">Deling</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Laster...</td></tr>
            ) : txs.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                Ingen transaksjoner funnet. Importer en DNB CSV-fil for å komme i gang.
              </td></tr>
            ) : txs.map(tx => (
              <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(tx.date)}</td>
                <td className="px-4 py-3 text-gray-800 max-w-xs truncate">{tx.description}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{tx.account_name}</td>
                <td className={`px-4 py-3 text-right font-medium tabular-nums ${
                  tx.amount < 0 ? 'text-red-600' : 'text-green-700'
                }`}>
                  {formatNOK(tx.amount)}
                </td>
                <td className="px-4 py-3">
                  <select
                    className="border border-gray-200 rounded-md px-2 py-1 text-xs w-36 bg-white"
                    value={tx.category_id || ''}
                    onChange={e => handleCategoryChange(tx.id, e.target.value)}
                  >
                    <option value="">— Velg kategori</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  {tx.shared_role === 'participant' ? (
                    <div className="space-y-2 text-xs">
                      <div className="text-purple-700">
                        Skylder {tx.split?.owner_name} {formatNOK(tx.split?.settlement_amount || 0)}
                      </div>
                          {tx.split?.settlement_status && (
                            <span className={`inline-flex rounded-full px-2 py-1 font-medium ${settlementTone(tx.split.settlement_status)}`}>
                              {tx.split.settlement_status === 'paid'
                                ? 'Betalt'
                                : tx.split.settlement_status === 'awaiting_approval'
                                  ? 'Venter på godkjenning'
                                  : tx.split.settlement_status === 'overdue'
                                    ? 'Forfalt'
                                    : 'Ubetalt'}
                            </span>
                          )}
                      {tx.split?.due_date && (
                        <div className="text-gray-500">Frist {formatDate(tx.split.due_date)}</div>
                      )}
                          {tx.split?.id && (
                            <button
                              type="button"
                              onClick={() => togglePaid(tx.split.id, tx.split.settlement_status !== 'paid')}
                              className="rounded-md border border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50"
                            >
                              {tx.split.settlement_status === 'paid'
                                ? 'Marker som ubetalt'
                                : tx.split.settlement_status === 'awaiting_approval'
                                  ? 'Trekk tilbake melding'
                                  : 'Meld som betalt'}
                            </button>
                          )}
                      {tx.split?.settlement_status !== 'paid' && (
                        <VippsPayButton
                          phoneNumber={userById[tx.split?.owner_user_id]?.vipps_phone}
                          amountNOK={tx.split?.settlement_amount || 0}
                          message={tx.description}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {!shareOpenByTx[tx.id] ? (
                        <button
                          type="button"
                          onClick={() => setShareEnabled(tx, true)}
                          className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                        >
                          Del
                        </button>
                      ) : (
                        <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-gray-600">Delt</span>
                            <button
                              type="button"
                              onClick={() => setShareEnabled(tx, false)}
                              className="text-xs text-gray-500 hover:text-gray-700"
                            >
                              Ikke delt
                            </button>
                          </div>

                          {suggestedUsers.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-[11px] uppercase tracking-wide text-gray-400">Tidligere delt med</p>
                              <div className="flex flex-wrap gap-1.5">
                                {suggestedUsers.map(user => (
                                  <button
                                    key={user.id}
                                    type="button"
                                    onClick={() => updateSplitDraft(tx.id, { participant_user_id: String(user.id) })}
                                    className={`rounded-full px-2.5 py-1 text-xs border ${
                                      String(user.id) === (splitDrafts[tx.id]?.participant_user_id || '')
                                        ? 'border-green-600 bg-green-50 text-green-700'
                                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
                                    }`}
                                  >
                                    {user.name}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="space-y-1">
                            <p className="text-[11px] uppercase tracking-wide text-gray-400">Søk etter bruker</p>
                            <input
                              type="text"
                              placeholder="Søk på navn eller e-post"
                              className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs bg-white"
                              value={shareSearchByTx[tx.id] || ''}
                              onChange={e => setShareSearchByTx(current => ({ ...current, [tx.id]: e.target.value }))}
                            />
                            {(shareSearchByTx[tx.id] || '').trim() !== '' && (
                              <div className="flex flex-wrap gap-1.5">
                                {searchedUsers(tx.id).length === 0 ? (
                                  <span className="text-xs text-gray-400">Ingen treff</span>
                                ) : searchedUsers(tx.id).map(user => (
                                  <button
                                    key={user.id}
                                    type="button"
                                    onClick={() => updateSplitDraft(tx.id, { participant_user_id: String(user.id) })}
                                    className={`rounded-full px-2.5 py-1 text-xs border ${
                                      String(user.id) === (splitDrafts[tx.id]?.participant_user_id || '')
                                        ? 'border-green-600 bg-green-50 text-green-700'
                                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
                                    }`}
                                  >
                                    {user.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {splitDrafts[tx.id]?.participant_user_id && (
                            <>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min="1"
                                  max="100"
                                  className="border border-gray-200 rounded-md px-2 py-1 text-xs w-20 bg-white"
                                  value={splitDrafts[tx.id]?.share_percent || '50'}
                                  onChange={e => updateSplitDraft(tx.id, { share_percent: e.target.value })}
                                />
                                <span className="text-xs text-gray-500">% andel</span>
                              </div>
                              <input
                                type="date"
                                className="border border-gray-200 rounded-md px-2 py-1 text-xs w-36 bg-white"
                                value={splitDrafts[tx.id]?.due_date || defaultDueDate(tx.date)}
                                onChange={e => updateSplitDraft(tx.id, { due_date: e.target.value })}
                              />
                              <button
                                type="button"
                                onClick={() => saveSplit(tx)}
                                className="rounded-md bg-gray-900 px-2 py-1 text-xs text-white hover:bg-gray-800"
                              >
                                Lagre
                              </button>
                            </>
                          )}

                          {tx.split && (
                            <div className="text-xs text-purple-700 space-y-1 pt-1">
                              <div>
                                {tx.split.participant_name} skylder {formatNOK(tx.split.settlement_amount || 0)}
                                {tx.split.status === 'pending' ? ' · Venter på svar' : ''}
                              </div>
                              {tx.split.settlement_status && tx.split.status === 'accepted' && (
                                <span className={`inline-flex rounded-full px-2 py-1 font-medium ${settlementTone(tx.split.settlement_status)}`}>
                                  {tx.split.settlement_status === 'paid'
                                    ? 'Betalt'
                                    : tx.split.settlement_status === 'awaiting_approval'
                                      ? 'Venter på godkjenning'
                                      : tx.split.settlement_status === 'overdue'
                                        ? 'Forfalt'
                                        : 'Ubetalt'}
                                </span>
                              )}
                              {tx.split?.due_date && tx.split.status === 'accepted' && (
                                <div className="text-gray-500">Frist {formatDate(tx.split.due_date)}</div>
                              )}
                              {tx.split?.id && tx.split.status === 'accepted' && (
                                <button
                                  type="button"
                                  onClick={() => togglePaid(tx.split.id, tx.split.settlement_status !== 'paid')}
                                  className="rounded-md border border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50"
                                >
                                  {tx.split.settlement_status === 'paid'
                                    ? 'Marker som ubetalt'
                                    : tx.split.settlement_status === 'awaiting_approval'
                                      ? 'Godkjenn betalt'
                                      : 'Marker som betalt'}
                                </button>
                              )}
                              {tx.split.status === 'accepted' && tx.split.settlement_status !== 'paid' && (
                                <VippsPayButton
                                  phoneNumber={currentUser?.vipps_phone}
                                  amountNOK={tx.split?.settlement_amount || 0}
                                  message={tx.description}
                                  isOwner
                                />
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
