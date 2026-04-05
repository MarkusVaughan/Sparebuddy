import { useEffect, useState } from 'react'
import { AUTH_TOKEN_STORAGE_KEY, users as userApi } from '../utils/api'

const emptyInviteForm = { name: '', email: '' }

export default function Settings({ user, onUserUpdated, onDeactivated }) {
  const [profileForm, setProfileForm] = useState({ name: '', email: '', vipps_phone: '' })
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '' })
  const [deactivatePassword, setDeactivatePassword] = useState('')
  const [inviteForm, setInviteForm] = useState(emptyInviteForm)
  const [invites, setInvites] = useState([])
  const [trustedUsers, setTrustedUsers] = useState([])
  const [message, setMessage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState('')

  useEffect(() => {
    if (!user) return
    setProfileForm({ name: user.name || '', email: user.email || '', vipps_phone: user.vipps_phone || '' })
  }, [user])

  async function load() {
    setLoading(true)
    try {
      const [inviteItems, trusted] = await Promise.all([
        userApi.invites(),
        userApi.trusted(),
      ])
      setInvites(inviteItems)
      setTrustedUsers(trusted)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function saveProfile(e) {
    e.preventDefault()
    setSubmitting('profile')
    setMessage(null)
    try {
      await userApi.updateProfile(profileForm)
      const me = await userApi.me()
      onUserUpdated?.(me)
      setMessage({ type: 'success', text: 'Profilen er oppdatert.' })
    } catch (error) {
      setMessage({ type: 'error', text: error?.response?.data?.detail || 'Kunne ikke oppdatere profilen.' })
    } finally {
      setSubmitting('')
    }
  }

  async function changePassword(e) {
    e.preventDefault()
    setSubmitting('password')
    setMessage(null)
    try {
      await userApi.changePassword(passwordForm)
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
      setMessage({ type: 'success', text: 'Passordet er endret. Logg inn på nytt.' })
      onDeactivated?.(false)
    } catch (error) {
      setMessage({ type: 'error', text: error?.response?.data?.detail || 'Kunne ikke endre passord.' })
    } finally {
      setSubmitting('')
    }
  }

  async function createInvite(e) {
    e.preventDefault()
    setSubmitting('invite')
    setMessage(null)
    try {
      await userApi.createInvite(inviteForm)
      setInviteForm(emptyInviteForm)
      await load()
      setMessage({ type: 'success', text: 'Invitasjon opprettet.' })
    } catch (error) {
      setMessage({ type: 'error', text: error?.response?.data?.detail || 'Kunne ikke opprette invitasjon.' })
    } finally {
      setSubmitting('')
    }
  }

  async function revokeInvite(inviteId) {
    setSubmitting(`revoke-${inviteId}`)
    setMessage(null)
    try {
      await userApi.revokeInvite(inviteId)
      await load()
      setMessage({ type: 'success', text: 'Invitasjonen er trukket tilbake.' })
    } catch (error) {
      setMessage({ type: 'error', text: error?.response?.data?.detail || 'Kunne ikke trekke tilbake invitasjonen.' })
    } finally {
      setSubmitting('')
    }
  }

  async function deactivateAccount() {
    if (!window.confirm('Er du sikker på at du vil deaktivere kontoen?')) return
    setSubmitting('deactivate')
    setMessage(null)
    try {
      await userApi.deactivate({ password: deactivatePassword })
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
      onDeactivated?.(true)
    } catch (error) {
      setMessage({ type: 'error', text: error?.response?.data?.detail || 'Kunne ikke deaktivere kontoen.' })
    } finally {
      setSubmitting('')
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Innstillinger</h1>
        <p className="text-sm text-gray-500">Profil, passord, familieinvitasjoner og kjente personer.</p>
      </div>

      {message && (
        <div className={`rounded-xl px-4 py-3 mb-6 text-sm border ${
          message.type === 'error'
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-green-50 border-green-200 text-green-700'
        }`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 mb-6">
        <form onSubmit={saveProfile} className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Profil</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Navn</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={profileForm.name}
                onChange={e => setProfileForm(current => ({ ...current, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">E-post</label>
              <input
                type="email"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={profileForm.email}
                onChange={e => setProfileForm(current => ({ ...current, email: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Vipps-nummer</label>
              <input
                type="text"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="f.eks. 47912345678"
                value={profileForm.vipps_phone}
                onChange={e => setProfileForm(current => ({ ...current, vipps_phone: e.target.value }))}
              />
              <p className="text-xs text-gray-400 mt-1">Brukes for Vipps-betaling ved deling av utgifter</p>
            </div>
            <button
              type="submit"
              disabled={submitting !== ''}
              className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              Lagre profil
            </button>
          </div>
        </form>

        <form onSubmit={changePassword} className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Passord</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nåværende passord</label>
              <input
                type="password"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={passwordForm.current_password}
                onChange={e => setPasswordForm(current => ({ ...current, current_password: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nytt passord</label>
              <input
                type="password"
                minLength={8}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={passwordForm.new_password}
                onChange={e => setPasswordForm(current => ({ ...current, new_password: e.target.value }))}
              />
            </div>
            <button
              type="submit"
              disabled={submitting !== ''}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              Endre passord
            </button>
          </div>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Inviter familie</h2>
          <form onSubmit={createInvite} className="space-y-4 mb-5">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Navn</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={inviteForm.name}
                onChange={e => setInviteForm(current => ({ ...current, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">E-post</label>
              <input
                type="email"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={inviteForm.email}
                onChange={e => setInviteForm(current => ({ ...current, email: e.target.value }))}
              />
            </div>
            <button
              type="submit"
              disabled={submitting !== ''}
              className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              Opprett invitasjon
            </button>
          </form>

          {loading ? (
            <p className="text-sm text-gray-400">Laster invitasjoner...</p>
          ) : invites.length === 0 ? (
            <p className="text-sm text-gray-400">Ingen invitasjoner ennå.</p>
          ) : (
            <div className="space-y-3">
              {invites.map(invite => (
                <div key={invite.id} className="rounded-lg border border-gray-200 px-4 py-3">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <p className="text-sm font-medium text-gray-900">{invite.name || invite.email}</p>
                    <span className={`text-xs rounded-full px-2.5 py-1 ${
                      invite.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : invite.status === 'accepted'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                    }`}>
                      {invite.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mb-1">{invite.email}</p>
                  <p className="text-xs text-gray-500 mb-3">Invitasjonskode: <span className="font-mono text-gray-700">{invite.invite_token}</span></p>
                  {invite.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => revokeInvite(invite.id)}
                      disabled={submitting !== ''}
                      className="text-xs rounded-lg border border-gray-200 px-2.5 py-1 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Trekk tilbake
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Kjente personer</h2>
          {loading ? (
            <p className="text-sm text-gray-400">Laster kjente personer...</p>
          ) : trustedUsers.length === 0 ? (
            <p className="text-sm text-gray-400">Ingen kjente personer ennå. Godkjente familieinvitasjoner blir lagt til her automatisk.</p>
          ) : (
            <div className="space-y-3">
              {trustedUsers.map(person => (
                <div key={person.id} className="rounded-lg border border-gray-200 px-4 py-3">
                  <p className="text-sm font-medium text-gray-900">{person.name}</p>
                  <p className="text-xs text-gray-500">{person.email}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-red-200 p-6">
        <h2 className="text-base font-semibold text-red-700 mb-2">Deaktiver konto</h2>
        <p className="text-sm text-gray-500 mb-4">
          Kontoen blir utilgjengelig for innlogging, men data beholdes i databasen.
        </p>
        <div className="max-w-md">
          <label className="block text-xs font-medium text-gray-600 mb-1">Bekreft med passord</label>
          <input
            type="password"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3"
            value={deactivatePassword}
            onChange={e => setDeactivatePassword(e.target.value)}
          />
          <button
            type="button"
            onClick={deactivateAccount}
            disabled={submitting !== ''}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            Deaktiver konto
          </button>
        </div>
      </div>
    </div>
  )
}

