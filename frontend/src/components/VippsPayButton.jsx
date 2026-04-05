import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

/**
 * VippsPayButton
 *
 * Props:
 *   phoneNumber  – recipient's Vipps phone (e.g. "47912345678")
 *   amountNOK    – amount in NOK (decimal OK, e.g. 275.50)
 *   message      – payment message string
 *   isOwner      – if true: show "Kopier Vipps-lenke" instead of "Betal med Vipps"
 */
const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:8001'

export default function VippsPayButton({ phoneNumber, amountNOK, message, isOwner = false }) {
  const [showQr, setShowQr] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!phoneNumber) return null

  const amountOre = Math.round(amountNOK * 100)
  const encodedMessage = encodeURIComponent(`Sparebuddy: ${message}`)
  const deeplink = `vipps://payment?phoneNumber=${phoneNumber}&amount=${amountOre}&message=${encodedMessage}`
  const qrUrl = `${apiBase}/vipps-redirect?phone=${phoneNumber}&amount=${amountOre}&message=${encodeURIComponent(message)}`

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(deeplink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: select a temp textarea
    }
  }

  if (isOwner) {
    return (
      <button
        type="button"
        onClick={copyLink}
        className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        title="Kopier Vipps-betalingslenke"
      >
        {copied ? 'Kopiert!' : 'Kopier Vipps-lenke'}
      </button>
    )
  }

  if (isMobile) {
    return (
      <a
        href={deeplink}
        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-[#FF5B24] text-white font-medium hover:opacity-90 transition-opacity"
      >
        <VippsIcon />
        Vipps
      </a>
    )
  }

  // Desktop: show QR toggle
  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={() => setShowQr(v => !v)}
        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-[#FF5B24] text-white font-medium hover:opacity-90 transition-opacity"
      >
        <VippsIcon />
        {showQr ? 'Skjul QR' : 'Vipps'}
      </button>
      {showQr && (
        <div className="mt-2 p-3 bg-white border border-gray-200 rounded-xl inline-block shadow-sm">
          <QRCodeSVG value={qrUrl} size={140} />
          <p className="text-xs text-gray-400 mt-2 text-center" style={{ maxWidth: 140 }}>Skann med kameraet på telefonen din for å betale i Vipps</p>
        </div>
      )}
    </div>
  )
}

function VippsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
    </svg>
  )
}
