/**
 * Settings Panel Component
 * 
 * Modal for configuring API keys and application settings.
 */

import { useState, useEffect } from 'react'
import { settingsApi } from '../services/api'
import './SettingsPanel.css'
import { Settings, X, Check, CheckCircle, AlertCircle } from 'lucide-react'

export default function SettingsPanel({ onClose }) {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [settings, setSettings] = useState({
        ai_provider: 'openai',
        openai_key_configured: false,
        github_key_configured: false
    })
    const [formData, setFormData] = useState({
        openai_api_key: '',
        github_models_api_key: '',
        ai_provider: 'openai'
    })
    const [message, setMessage] = useState(null)

    useEffect(() => {
        loadSettings()
    }, [])

    const loadSettings = async () => {
        try {
            const data = await settingsApi.get()
            setSettings(data)
            setFormData(prev => ({
                ...prev,
                ai_provider: data.ai_provider || 'openai'
            }))
        } catch (error) {
            console.error('Failed to load settings:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async () => {
        setSaving(true)
        setMessage(null)

        try {
            const payload = { ai_provider: formData.ai_provider }
            if (formData.openai_api_key) {
                payload.openai_api_key = formData.openai_api_key
            }
            if (formData.github_models_api_key) {
                payload.github_models_api_key = formData.github_models_api_key
            }

            await settingsApi.update(payload)
            setMessage({ type: 'success', text: 'Settings saved successfully!' })

            // Clear password fields
            setFormData(prev => ({
                ...prev,
                openai_api_key: '',
                github_models_api_key: ''
            }))

            // Reload settings
            loadSettings()
        } catch (error) {
            setMessage({
                type: 'error',
                text: error.response?.data?.detail || 'Failed to save settings'
            })
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="modal-overlay" onClick={onClose}>
                <div className="modal settings-panel" onClick={(e) => e.stopPropagation()}>
                    <div className="loading">
                        <div className="spinner"></div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="settings-panel-content">
            <section className="settings-section">
                <h3>AI Provider</h3>
                <p className="section-description">
                    Configure your AI service for code suggestions and generation.
                </p>

                <div className="form-group">
                    <label className="form-label">Provider</label>
                    <select
                        className="form-input"
                        value={formData.ai_provider}
                        onChange={(e) => setFormData(prev => ({ ...prev, ai_provider: e.target.value }))}
                    >
                        <option value="openai">OpenAI</option>
                        <option value="github">GitHub Models</option>
                    </select>
                </div>

                <div className="form-group">
                    <label className="form-label">
                        OpenAI API Key
                        {settings.openai_key_configured && (
                            <span className="key-status configured"><Check size={14} /> Configured</span>
                        )}
                    </label>
                    <input
                        type="password"
                        className="form-input"
                        value={formData.openai_api_key}
                        onChange={(e) => setFormData(prev => ({ ...prev, openai_api_key: e.target.value }))}
                        placeholder={settings.openai_key_configured ? '••••••••' : 'sk-...'}
                        autoComplete="new-password"
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">
                        GitHub Models API Key
                        {settings.github_key_configured && (
                            <span className="key-status configured"><Check size={14} /> Configured</span>
                        )}
                    </label>
                    <input
                        type="password"
                        className="form-input"
                        value={formData.github_models_api_key}
                        onChange={(e) => setFormData(prev => ({ ...prev, github_models_api_key: e.target.value }))}
                        placeholder={settings.github_key_configured ? '••••••••' : 'ghp_...'}
                        autoComplete="new-password"
                    />
                </div>
            </section>

            {message && (
                <div className={`settings-message ${message.type}`}>
                    {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />} {message.text}
                </div>
            )}

            <div className="panel-actions mt-4">
                <button
                    className="btn btn-primary w-full"
                    onClick={handleSave}
                    disabled={saving}
                >
                    {saving ? 'Saving...' : 'Save Settings'}
                </button>
            </div>
        </div>
    )
}
