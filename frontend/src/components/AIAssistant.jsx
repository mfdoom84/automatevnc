/**
 * AI Assistant Component
 * 
 * Panel for AI-powered code suggestions and generation.
 */

import { useState, useCallback } from 'react'
import { aiApi } from '../services/api'
import './AIAssistant.css'
import {
    Bot, X, Lightbulb, Search,
    AlertCircle, CheckCircle, Mic, Copy, Check
} from 'lucide-react'

export default function AIAssistant({ mode: appMode = 'visual', code, onClose, isRecording = false }) {
    const [instructions, setInstructions] = useState('')
    const [loading, setLoading] = useState(false)
    const [response, setResponse] = useState(null)
    const [copySuccess, setCopySuccess] = useState(false)

    const handleSuggest = async () => {
        if (!code) return

        setLoading(true)
        setResponse(null)

        try {
            const result = await aiApi.suggest(code, appMode, instructions)
            setResponse({
                type: 'suggestions',
                data: result
            })
        } catch (error) {
            setResponse({
                type: 'error',
                message: error.response?.data?.detail || 'Failed to get suggestions'
            })
        } finally {
            setLoading(false)
        }
    }

    const handleCopy = useCallback((text) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopySuccess(true)
            setTimeout(() => setCopySuccess(false), 2000)
        })
    }, [])

    return (
        <div className="ai-assistant">
            <div className="ai-header">
                <div className="ai-title">
                    <span className="ai-icon"><Bot size={24} /></span>
                    <div className="ai-title-text">
                        <span>AI Assistant</span>
                        <span className="ai-mode-label">{appMode === 'code' ? 'Code Reviewer' : 'Step Optimizer'}</span>
                    </div>
                </div>
                {onClose && (
                    <button className="modal-close" onClick={onClose}><X size={20} /></button>
                )}
            </div>

            <div className="ai-content">
                {isRecording && (
                    <div className="ai-recording-tip">
                        <Mic size={14} />
                        <span>Recording is on. Use <strong>Review</strong> to harden your script and get robustness suggestions.</span>
                    </div>
                )}

                <div className="ai-description-section">
                    <p className="ai-description">
                        {appMode === 'code'
                            ? "Review your script for robustness, Pythonic style, or logical errors."
                            : "Analyze your visual steps for robustness and smart wait recommendations."
                        }
                    </p>

                    <div className="ai-instruction-group">
                        <label className="ai-label">Review Focus (Optional):</label>
                        <textarea
                            className="ai-prompt"
                            value={instructions}
                            onChange={(e) => setInstructions(e.target.value)}
                            placeholder="e.g. Focus on error handling, optimize the waits, etc."
                            rows={2}
                        />
                    </div>

                    <button
                        className="btn btn-primary ai-action"
                        onClick={handleSuggest}
                        disabled={loading || !code}
                    >
                        {loading ? 'Analyzing...' : <><Search size={16} /> {appMode === 'code' ? 'Review Code' : 'Optimize Steps'}</>}
                    </button>
                </div>

                {/* Response Display */}
                {response && (
                    <div className={`ai-response ${response.type}`}>
                        {response.type === 'error' && (
                            response.message.includes('not configured') ? (
                                <div className="ai-config-error animate-slide-up">
                                    <div className="error-icon-circle">
                                        <AlertCircle size={32} />
                                    </div>
                                    <h3>AI Setup Required</h3>
                                    <p>The AI Assistant needs an API key to function. Please configure your provider in the application settings.</p>
                                    <button
                                        className="btn btn-secondary btn-sm mt-4"
                                        onClick={() => {
                                            // Close assistant and maybe parent knows to open settings
                                            // For now we just show a helpful message
                                        }}
                                        disabled
                                    >
                                        Use Settings (Top Right)
                                    </button>
                                </div>
                            ) : (
                                <div className="error-message">
                                    <AlertCircle size={16} className="mr-2 inline" /> {response.message}
                                </div>
                            )
                        )}

                        {response.type === 'suggestions' && (
                            <div className="suggestions-list">
                                <h4>Suggestions:</h4>
                                {response.data.suggestions?.length > 0 ? (
                                    <ul>
                                        {response.data.suggestions.map((sugg, i) => (
                                            <li key={i}>{sugg}</li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p>No suggestions - your code looks good! <CheckCircle size={16} className="inline ml-1 text-success" /></p>
                                )}

                                {response.data.improved_code && (
                                    <div className="improved-code">
                                        <div className="improved-code-header">
                                            <h4>Improved Code:</h4>
                                            <button
                                                className="btn btn-xs btn-ghost copy-btn"
                                                onClick={() => handleCopy(response.data.improved_code)}
                                                title="Copy to clipboard"
                                            >
                                                {copySuccess ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                                                {copySuccess ? 'Copied!' : 'Copy'}
                                            </button>
                                        </div>
                                        <pre>{response.data.improved_code}</pre>
                                        <p className="ai-hint">Copy and paste this into your editor to apply changes.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
