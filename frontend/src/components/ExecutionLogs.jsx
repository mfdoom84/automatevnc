import React, { useState, useEffect, useRef } from 'react'
import { runsApi } from '../services/api'
import { Terminal, RefreshCcw, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import './ExecutionLogs.css'

const ExecutionLogs = ({ runId, isRecording }) => {
    const [logs, setLogs] = useState('')
    const [isComplete, setIsComplete] = useState(false)
    const [status, setStatus] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const scrollRef = useRef(null)
    const pollIntervalRef = useRef(null)

    useEffect(() => {
        if (runId) {
            setLogs('')
            setIsComplete(false)
            setLoading(true)
            setError(null)
            startPolling(runId)
        } else {
            stopPolling()
        }

        return () => stopPolling()
    }, [runId])

    useEffect(() => {
        // Auto-scroll to bottom when logs change
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [logs])

    const startPolling = (id) => {
        stopPolling()
        fetchLogs(id) // Initial fetch
        pollIntervalRef.current = setInterval(() => fetchLogs(id), 2000)
    }

    const stopPolling = () => {
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
        }
    }

    const fetchLogs = async (id) => {
        try {
            const data = await runsApi.getLogs(id)
            setLogs(data.logs || '')
            setIsComplete(data.is_complete || false)
            setStatus(data.status || null)
            setLoading(false)

            if (data.is_complete) {
                stopPolling()
            }
        } catch (err) {
            console.error('Failed to fetch logs:', err)
            setError('Failed to load logs')
            stopPolling()
        }
    }

    if (!runId && !isRecording) {
        return (
            <div className="logs-empty">
                <Terminal size={48} strokeWidth={1} />
                <h3>No recording or execution active.</h3>
                <p>Start recording and run a script to see real-time logs here.</p>
            </div>
        )
    }

    if (isRecording && !runId) {
        return (
            <div className="logs-empty">
                <div className="recording-indicator">
                    <div className="dot pulse"></div>
                    <span>Recording Mode</span>
                </div>
                <p>Actions will appear in the script editor.</p>
            </div>
        )
    }

    return (
        <div className="execution-logs">
            <div className="logs-header">
                <div className="run-info">
                    <span className="run-id">Run ID: {runId}</span>
                    {status === 'failed' ? (
                        <span className="status-badge error">
                            <XCircle size={12} /> Failed
                        </span>
                    ) : isComplete ? (
                        <span className="status-badge success">
                            <CheckCircle size={12} /> Finished
                        </span>
                    ) : error ? (
                        <span className="status-badge error">
                            <XCircle size={12} /> Error
                        </span>
                    ) : (
                        <span className="status-badge running">
                            <Loader2 size={12} className="animate-spin" /> Running
                        </span>
                    )}
                </div>
                {!isComplete && !error && (
                    <button className="btn-refresh" onClick={() => fetchLogs(runId)}>
                        <RefreshCcw size={14} />
                    </button>
                )}
            </div>

            <div className="logs-container" ref={scrollRef}>
                {loading && !logs ? (
                    <div className="logs-loading">
                        <Loader2 className="animate-spin" />
                        <span>Initializing logs...</span>
                    </div>
                ) : (
                    <pre className="logs-content">
                        {logs || 'Waiting for output...'}
                    </pre>
                )}
                {error && <div className="logs-error">{error}</div>}
            </div>
        </div>
    )
}

export default ExecutionLogs
