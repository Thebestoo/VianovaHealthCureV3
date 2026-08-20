import React, { useEffect, useRef, useState } from 'react'
import { AlertTriangle, HelpCircle, X } from 'lucide-react'

// Shared confirmation dialog — replaces window.confirm() across the app so
// destructive/consequential actions get a brandable modal with room to
// explain consequences, instead of the native unstyleable browser dialog.
export default function ConfirmDialog({
  open,
  title,
  message,
  children,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = false,
  requireTypedConfirmation = null,
  onConfirm,
  onCancel,
}) {
  const [typed, setTyped] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) setTyped('')
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e) {
      if (e.key === 'Escape') onCancel?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  useEffect(() => {
    if (open && requireTypedConfirmation) {
      // focus the typed-confirmation input once the dialog mounts
      const t = setTimeout(() => inputRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [open, requireTypedConfirmation])

  if (!open) return null

  const typedMismatch = requireTypedConfirmation && typed.trim() !== requireTypedConfirmation
  const confirmDisabled = !!typedMismatch

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 1300 }}
      onClick={e => { if (e.target === e.currentTarget) onCancel?.() }}
    >
      <div className="modal-card" style={{ maxWidth: 440 }} role="alertdialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <div className={`modal-icon ${danger ? 'danger' : 'neutral'}`}>
            {danger ? <AlertTriangle size={18} /> : <HelpCircle size={18} />}
          </div>
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={() => onCancel?.()} aria-label="Cancel"><X size={17} /></button>
        </div>

        <div className="modal-body">
          {message && <div>{message}</div>}
          {children}
          {requireTypedConfirmation && (
            <div className="form-group" style={{ marginTop: 14, marginBottom: 0 }}>
              <label className="form-label">
                Type <strong>{requireTypedConfirmation}</strong> to confirm
              </label>
              <input
                ref={inputRef}
                type="text"
                className="form-input"
                value={typed}
                onChange={e => setTyped(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !confirmDisabled) onConfirm?.() }}
                placeholder={requireTypedConfirmation}
                autoComplete="off"
              />
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary btn-sm" onClick={() => onCancel?.()}>{cancelLabel}</button>
          <button
            className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => onConfirm?.()}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
