import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { transactions as txApi, accounts as accApi, categories as catApi } from '../utils/api'
import { Plus } from 'lucide-react'
import { formatNOK, formatDate, currentMonth } from '../utils/format'
import { Upload, RefreshCw, Search } from 'lucide-react'

export default function Transactions() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [txs, setTxs] = useState([])
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState(null)

  const [filters, setFilters] = useState({
    account_id: searchParams.get('account_id') || '',
    category_id: searchParams.get('category_id') || '',
    month: searchParams.get('month') || currentMonth(),
    search: searchParams.get('search') || '',
    uncategorized: searchParams.get('uncategorized') === 'true',
  })

  const [selectedAccount, setSelectedAccount] = useState('')
  const [showNewAccount, setShowNewAccount] = useState(false)
  const [newAccount, setNewAccount] = useState({ name: '', bank: 'DNB', account_type: 'checking' })
  const fileRef = useRef()

  useEffect(() => {
    Promise.all([accApi.list(), catApi.list()]).then(([a, c]) => {
      setAccounts(a)
      setCategories(c)
    })
  }, [])

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
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Laster...</td></tr>
            ) : txs.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
