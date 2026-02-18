/**
 * Run History Component
 * 
 * Panel for viewing past script runs and their logs.
 */

import { useState, useEffect } from 'react'
import { runsApi } from '../services/api'
import './RunHistory.css'
import {
    Clock, Play, CheckCircle, XCircle, Ban,
    FileText, X, ClipboardList, Timer, Eye, Download, Trash2
} from 'lucide-react'

function RunStatusBadge({ status }) {
    const statusConfig = {
        queued: { color: 'info', icon: <Clock size={14} /> },
        running: { color: 'warning', icon: <Play size={14} /> },
        success: { color: 'success', icon: <CheckCircle size={14} /> },
        failed: { color: 'error', icon: <XCircle size={14} /> },
        cancelled: { color: 'warning', icon: <Ban size={14} /> }
    }

    const config = statusConfig[status] || { color: 'info', icon: '?' }

    return (
        <span className={`badge badge-${config.color} flex items-center gap-1`}>
            {config.icon} {status}
        </span>
    )
}

function RunItem({ run, onViewLogs, onViewScreenshot, onDelete }) {
    const formatDate = (dateStr) => {
        if (!dateStr) return '-'
        return new Date(dateStr).toLocaleString()
    }

    const formatDuration = (start, end) => {
        if (!start || !end) return '-'
        const ms = new Date(end) - new Date(start)
        if (ms < 1000) return `${ms}ms`
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
        return `${(ms / 60000).toFixed(1)}min`
    }

    return (
        <div className="run-item">
            <div className="run-header">
                <span className="run-script">{run.script_name}</span>
                <RunStatusBadge status={run.status} />
            </div>

            <div className="run-meta">
                <span>ID: {run.id.substring(0, 8)}</span>
                <span>{formatDate(run.started_at)}</span>
                <span className="flex items-center gap-1"><Timer size={14} /> {formatDuration(run.started_at, run.completed_at)}</span>
            </div>

            {run.error_message && (
                <div className="run-error">
                    {run.error_message}
                </div>
            )}

            <div className="run-actions">
                <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => onViewLogs(run.id)}
                >
                    <FileText size={14} /> View Logs
                </button>
                {run.status === 'failed' && (
                    <button
                        className="btn btn-sm btn-ghost text-error"
                        onClick={() => onViewScreenshot(run.id)}
                        title="View Failure Screenshot"
                    >
                        <Eye size={14} /> View Screenshot
                    </button>
                )}
                <button
                    className="btn btn-sm btn-ghost delete-btn"
                    onClick={() => onDelete(run.id)}
                    title="Delete Run"
                >
                    <Trash2 size={14} />
                </button>
            </div>
        </div>
    )
}

function LogViewer({ runId, onClose }) {
    const [logs, setLogs] = useState('')
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadLogs()
    }, [runId])

    const loadLogs = async () => {
        try {
            const data = await runsApi.getLogs(runId)
            setLogs(data.logs || 'No logs available')
        } catch (error) {
            setLogs('Failed to load logs')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="log-viewer">
            <div className="log-header">
                <span>Execution Logs</span>
                <button onClick={onClose}><X size={16} /></button>
            </div>
            <div className="log-content">
                {loading ? (
                    <div className="loading">
                        <div className="spinner"></div>
                    </div>
                ) : (
                    <pre>{logs}</pre>
                )}
            </div>
        </div>
    )
}

function DeleteConfirmationModal({ runId, onConfirm, onCancel }) {
    const [deleting, setDeleting] = useState(false)

    const handleConfirm = async () => {
        setDeleting(true)
        try {
            await onConfirm(runId)
        } finally {
            setDeleting(false)
        }
    }

    return (
        <div className="delete-modal-overlay">
            <div className="delete-modal">
                <div className="delete-modal-header">
                    <Trash2 size={24} className="delete-icon" />
                    <h3>Delete Run</h3>
                </div>
                <div className="delete-modal-content">
                    <p>Are you sure you want to delete this run?</p>
                    <p className="delete-warning">This will permanently delete all logs and screenshots associated with this run. This action cannot be undone.</p>
                </div>
                <div className="delete-modal-actions">
                    <button 
                        className="btn btn-secondary" 
                        onClick={onCancel}
                        disabled={deleting}
                    >
                        Cancel
                    </button>
                    <button 
                        className="btn btn-error" 
                        onClick={handleConfirm}
                        disabled={deleting}
                    >
                        {deleting ? 'Deleting...' : 'Delete'}
                    </button>
                </div>
            </div>
        </div>
    )
}

function ScreenshotViewer({ runId, onClose }) {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const screenshotUrl = `/api/runs/${runId}/artifacts/screenshot`

    useEffect(() => {
        // Preload the image to show loading state
        const img = new Image()
        img.onload = () => setLoading(false)
        img.onerror = () => {
            setError('Failed to load screenshot')
            setLoading(false)
        }
        img.src = screenshotUrl
    }, [runId])

    const handleDownload = () => {
        const link = document.createElement('a')
        link.href = screenshotUrl
        link.download = `screenshot-${runId}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    return (
        <div className="screenshot-viewer">
            <div className="screenshot-header">
                <span>Failure Screenshot</span>
                <div className="screenshot-actions">
                    <button 
                        className="download-btn" 
                        onClick={handleDownload}
                        title="Download full size screenshot"
                    >
                        <Download size={16} />
                    </button>
                    <button onClick={onClose}><X size={16} /></button>
                </div>
            </div>
            <div className="screenshot-content">
                {loading ? (
                    <div className="loading">
                        <div className="spinner"></div>
                    </div>
                ) : error ? (
                    <div className="error-message">{error}</div>
                ) : (
                    <img 
                        src={screenshotUrl} 
                        alt="Failure screenshot"
                        className="screenshot-image"
                    />
                )}
            </div>
        </div>
    )
}

export default function RunHistory({ onClose }) {
    const [runs, setRuns] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedRunId, setSelectedRunId] = useState(null)
    const [selectedScreenshotRunId, setSelectedScreenshotRunId] = useState(null)
    const [runToDelete, setRunToDelete] = useState(null)

    useEffect(() => {
        loadRuns()

        // Auto-refresh every 5 seconds
        const interval = setInterval(loadRuns, 5000)
        return () => clearInterval(interval)
    }, [])

    const loadRuns = async () => {
        try {
            const data = await runsApi.list(50)
            setRuns(data)
        } catch (error) {
            console.error('Failed to load runs:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleDeleteRun = async (runId) => {
        try {
            await runsApi.delete(runId)
            setRunToDelete(null)
            loadRuns() // Refresh the list
        } catch (error) {
            console.error('Failed to delete run:', error)
            alert('Failed to delete run')
        }
    }

    return (
        <div className="run-history-panel">
            {loading ? (
                <div className="loading">
                    <div className="spinner"></div>
                </div>
            ) : runs.length === 0 ? (
                <div className="empty-state">
                    <span className="empty-state-icon"><ClipboardList size={32} /></span>
                    <h3>No history</h3>
                    <p>Recent runs will appear here</p>
                </div>
            ) : (
                <div className="runs-list">
                    {runs.map((run) => (
                        <RunItem
                            key={run.id}
                            run={run}
                            onViewLogs={setSelectedRunId}
                            onViewScreenshot={setSelectedScreenshotRunId}
                            onDelete={setRunToDelete}
                        />
                    ))}
                </div>
            )}

            {selectedRunId && (
                <LogViewer
                    runId={selectedRunId}
                    onClose={() => setSelectedRunId(null)}
                />
            )}

            {selectedScreenshotRunId && (
                <ScreenshotViewer
                    runId={selectedScreenshotRunId}
                    onClose={() => setSelectedScreenshotRunId(null)}
                />
            )}

            {runToDelete && (
                <DeleteConfirmationModal
                    runId={runToDelete}
                    onConfirm={handleDeleteRun}
                    onCancel={() => setRunToDelete(null)}
                />
            )}
        </div>
    )
}
