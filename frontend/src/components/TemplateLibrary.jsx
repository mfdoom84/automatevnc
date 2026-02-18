import { useState, useEffect, useCallback } from 'react'
import { scriptsApi } from '../services/api'
import { Trash2, Image as ImageIcon, Search, Plus, Info } from 'lucide-react'
import './TemplateLibrary.css'

export default function TemplateLibrary({ scriptName, onInsert, version }) {
    const [templates, setTemplates] = useState([])
    const [loading, setLoading] = useState(false)
    const [filter, setFilter] = useState('')

    const loadTemplates = useCallback(async () => {
        if (!scriptName) {
            setTemplates([])
            return
        }
        setLoading(true)
        try {
            const data = await scriptsApi.listTemplates(scriptName)
            setTemplates(data.templates || [])
        } catch (error) {
            console.error('Failed to load templates:', error)
        } finally {
            setLoading(false)
        }
    }, [scriptName, version])

    useEffect(() => {
        loadTemplates()
    }, [loadTemplates])

    const handleDelete = async (e, templateName) => {
        e.stopPropagation()
        if (!window.confirm(`Are you sure you want to delete template "${templateName}"?`)) {
            return
        }

        try {
            await scriptsApi.deleteTemplate(scriptName, templateName)
            setTemplates(prev => prev.filter(t => t !== templateName))
        } catch (error) {
            console.error('Failed to delete template:', error)
            alert('Failed to delete template')
        }
    }

    const filteredTemplates = templates.filter(t =>
        t.toLowerCase().includes(filter.toLowerCase())
    )

    if (!scriptName) {
        return (
            <div className="template-library-empty">
                <div className="placeholder-content">
                    <ImageIcon size={32} />
                    <p>Open a script to see templates</p>
                </div>
            </div>
        )
    }

    return (
        <div className="template-library">
            <div className="library-header">
                <div className="header-top">
                    <h3>Templates</h3>
                    <span className="count-badge">{templates.length}</span>
                </div>
                <div className="search-box">
                    <Search size={12} />
                    <input
                        type="text"
                        placeholder="Filter templates..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />
                </div>
            </div>

            <div className="library-scroll">
                {loading && templates.length === 0 ? (
                    <div className="loading-state">Loading templates...</div>
                ) : filteredTemplates.length === 0 ? (
                    <div className="empty-state">
                        {filter ? 'No matching templates' : 'No templates found'}
                    </div>
                ) : (
                    <div className="template-grid">
                        {filteredTemplates.map(name => (
                            <div
                                key={name}
                                className="template-item"
                                onClick={() => onInsert(`vnc.click("${name}")`)}
                                title={`Insert: vnc.click("${name}")`}
                            >
                                <div className="template-preview">
                                    <img
                                        src={`/api/scripts/${scriptName}/templates/${name}`}
                                        alt={name}
                                        loading="lazy"
                                    />
                                    <button
                                        className="delete-btn"
                                        onClick={(e) => handleDelete(e, name)}
                                        title="Delete template"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                                <div className="template-name" title={name}>
                                    {name}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="library-footer">
                <div className="tip">
                    <Info size={14} />
                    <span>Click a template to insert click command. Templates are captured during "Smart Recording".</span>
                </div>
            </div>
        </div>
    )
}
