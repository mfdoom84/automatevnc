/**
 * Connection Dialog Component
 * 
 * Modal for entering VNC connection details.
 */

import { useState } from 'react'
import { vncApi } from '../services/api'
import './ConnectionDialog.css'
import { Plug, X, CheckCircle, AlertTriangle, AlertCircle, Search } from 'lucide-react'

export default function ConnectionDialog({ onConnect, onClose }) {
    const [host, setHost] = useState('')
    const [port, setPort] = useState(5900)
    const [password, setPassword] = useState('')
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState(null)

    const handleTest = async () => {
        if (!host) return

        setTesting(true)
        setTestResult(null)

        try {
            const result = await vncApi.testConnection(host, port)
            setTestResult(result)
        } catch (error) {
            setTestResult({
                status: 'error',
                message: error.message || 'Connection test failed'
            })
        } finally {
            setTesting(false)
        }
    }

    const handleConnect = async () => {
        if (!host) return

        // Auto-test before connecting if not already tested successfully
        if (!testResult || testResult.status !== 'ok') {
            setTesting(true)
            setTestResult(null)
            try {
                const result = await vncApi.testConnection(host, port)
                setTestResult(result)
                if (result.status !== 'ok') {
                    setTesting(false)
                    return // Stay in dialog if test fails
                }
            } catch (error) {
                setTestResult({
                    status: 'error',
                    message: error.message || 'Connection test failed'
                })
                setTesting(false)
                return
            } finally {
                setTesting(false)
            }
        }

        onConnect({ host, port, password })
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal connection-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title"><Plug size={22} className="mr-2" /> Connect to VNC</h2>
                    <button className="modal-close" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="modal-body">
                    <div className="form-group">
                        <label className="form-label">VNC Host</label>
                        <input
                            type="text"
                            className="form-input"
                            value={host}
                            onChange={(e) => setHost(e.target.value)}
                            placeholder="192.168.1.100 or hostname"
                            autoFocus
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Port</label>
                            <input
                                type="number"
                                className="form-input"
                                value={port}
                                onChange={(e) => setPort(parseInt(e.target.value) || '')}
                                autoCorrect="off"
                                autoComplete="off"
                                spellCheck="false"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Password (optional)</label>
                            <input
                                type="password"
                                className="form-input"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="VNC password"
                            />
                        </div>
                    </div>

                    {testResult && (
                        <div className={`test-result ${testResult.status}`}>
                            {testResult.status === 'ok' && (
                                <>
                                    <span className="result-icon"><CheckCircle size={18} /></span>
                                    <span>Connected! (Host: {testResult.host}, Port: {testResult.port}, {testResult.rfb_version})</span>
                                </>
                            )}
                            {testResult.status === 'error' && (
                                <>
                                    <span className="result-icon"><AlertCircle size={18} /></span>
                                    <div className="result-text">
                                        <span>{testResult.message}</span>
                                        {(host.toLowerCase() === 'localhost' || host === '127.0.0.1') && (
                                            <p className="hint">Tip: Try using <strong>host.docker.internal</strong> for localhost on Windows/Mac.</p>
                                        )}
                                    </div>
                                </>
                            )}
                            {testResult.status === 'warning' && (
                                <>
                                    <span className="result-icon"><AlertTriangle size={18} /></span>
                                    <span>{testResult.message}</span>
                                </>
                            )}
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button
                        className="btn btn-secondary"
                        onClick={handleTest}
                        disabled={!host || testing}
                    >
                        {testing ? 'Testing...' : <><Search size={16} /> Test Connection</>}
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleConnect}
                        disabled={!host}
                    >
                        Connect
                    </button>
                </div>
            </div>
        </div>
    )
}
