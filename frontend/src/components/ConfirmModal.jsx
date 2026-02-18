import React from 'react'
import { AlertCircle, X } from 'lucide-react'
import './ConfirmModal.css'

export default function ConfirmModal({
    isOpen,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
    onDiscard,
    isDestructive = false
}) {
    if (!isOpen) return null

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="modal confirm-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title display-flex align-center">
                        {isDestructive && <AlertCircle size={20} className="text-danger mr-2" />}
                        {title}
                    </h2>
                    <button className="modal-close" onClick={onCancel}>
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-body">
                    <p className="confirm-message">{message}</p>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-ghost" onClick={onCancel}>
                        {cancelLabel}
                    </button>
                    {onDiscard && (
                        <button
                            className="btn btn-ghost"
                            onClick={onDiscard}
                        >
                            Don't Save
                        </button>
                    )}
                    <button
                        className={`btn ${isDestructive ? 'btn-danger' : 'btn-primary'}`}
                        onClick={onConfirm}
                        autoFocus
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}
