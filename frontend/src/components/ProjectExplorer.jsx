import { useState, useEffect, useRef } from 'react'
import { scriptsApi } from '../services/api'
import './ProjectExplorer.css'
import {
    Plus, Code2, FileCode, Download, Upload,
    Search, Edit2, Trash2
} from 'lucide-react'

import ConfirmModal from './ConfirmModal'

export default function ProjectExplorer({ currentScript, onSelect, onCreate }) {
    const [scripts, setScripts] = useState([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('')

    // Create Script State
    const [isCreating, setIsCreating] = useState(false)
    const [newName, setNewName] = useState('')
    const [creatingState, setCreatingState] = useState(false)

    // Confirmation state
    const [confirmDelete, setConfirmDelete] = useState({
        isOpen: false,
        scriptName: null
    })

    // Rename state
    const [editingScriptName, setEditingScriptName] = useState(null)
    const [newRenamedName, setNewRenamedName] = useState('')
    const [renameError, setRenameError] = useState('')
    const [isRenamingState, setIsRenamingState] = useState(false)

    // Import file ref
    const fileInputRef = useRef(null)

    useEffect(() => {
        loadScripts()
    }, [])

    const loadScripts = async () => {
        setLoading(true)
        try {
            const data = await scriptsApi.list()
            setScripts(data)
        } catch (error) {
            console.error('Failed to load scripts:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleCreate = async (e) => {
        e.preventDefault()
        if (!newName.trim()) return

        setCreatingState(true)
        try {
            await onCreate(newName.trim(), '')
            setIsCreating(false)
            setNewName('')
            loadScripts()
        } catch (error) {
            console.error('Failed to create script:', error)
        } finally {
            setCreatingState(false)
        }
    }

    const confirmDeleteScript = (name, e) => {
        e.stopPropagation()
        setConfirmDelete({
            isOpen: true,
            scriptName: name
        })
    }

    const handleDelete = async () => {
        const name = confirmDelete.scriptName
        if (!name) return

        try {
            await scriptsApi.delete(name)
            setConfirmDelete({ isOpen: false, scriptName: null })
            loadScripts()
            // If deleted script was current, parent might want to know (handled by parent typically)
        } catch (error) {
            console.error('Failed to delete script:', error)
        }
    }

    const startRename = (scriptName, e) => {
        e.stopPropagation()
        setEditingScriptName(scriptName)
        setNewRenamedName(scriptName)
        setRenameError('')
    }

    const cancelRename = () => {
        setEditingScriptName(null)
        setNewRenamedName('')
        setRenameError('')
    }

    const handleRename = async () => {
        const trimmedName = newRenamedName.trim()

        // Validation
        if (!trimmedName) {
            setRenameError('Script name cannot be empty')
            return
        }

        if (trimmedName === editingScriptName) {
            cancelRename()
            return
        }

        // Check for conflicts
        if (scripts.some(s => s.name === trimmedName && s.name !== editingScriptName)) {
            setRenameError('A script with this name already exists')
            return
        }

        setIsRenamingState(true)
        try {
            await scriptsApi.update(editingScriptName, { name: trimmedName })

            // If the current script was renamed, reload it with the new name
            if (currentScript?.metadata?.name === editingScriptName) {
                onSelect(trimmedName)
            }

            loadScripts()
            cancelRename()
        } catch (error) {
            console.error('Failed to rename script:', error)
            setRenameError('Failed to rename script')
        } finally {
            setIsRenamingState(false)
        }
    }

    const handleExport = async (scriptName, e) => {
        e.stopPropagation()
        try {
            const script = await scriptsApi.get(scriptName)
            const dataStr = JSON.stringify(script, null, 2)
            const blob = new Blob([dataStr], { type: 'application/json' })
            const url = URL.createObjectURL(blob)

            const a = document.createElement('a')
            a.href = url
            a.download = `${scriptName}.json`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        } catch (error) {
            console.error('Export failed:', error)
            alert('Failed to export script')
        }
    }

    const handleImportClick = () => {
        fileInputRef.current?.click()
    }

    const handleImportFile = async (e) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = async (event) => {
            try {
                const json = JSON.parse(event.target.result)
                // Validate minimal structure
                if (!json.metadata || !json.steps) {
                    throw new Error('Invalid script format')
                }

                // Create unique name if exists
                let importName = json.metadata.name || file.name.replace('.json', '')

                // Simple rename logic if conflict (could be better)
                const exists = scripts.find(s => s.name === importName)
                if (exists) {
                    importName = `${importName}_imported_${Date.now()}`
                }

                await scriptsApi.create({
                    name: importName,
                    description: json.metadata.description,
                    steps: json.steps
                })

                loadScripts()
                e.target.value = null // Reset
            } catch (err) {
                console.error('Import error:', err)
                alert('Failed to import script: ' + err.message)
            }
        }
        reader.readAsText(file)
    }

    const filteredScripts = scripts.filter(s =>
        s.name.toLowerCase().includes(filter.toLowerCase())
    )

    const formatDate = (dateStr) => {
        return new Date(dateStr).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    return (
        <div className="project-explorer">
            <div className="explorer-content">
                <div className="explorer-actions">
                    <div className="search-box">
                        <Search size={14} />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            autoComplete="off"
                        />
                    </div>
                    <div className="action-buttons">
                        <button className="btn-icon-sm" onClick={() => setIsCreating(true)} title="New Script">
                            <Plus size={16} />
                        </button>
                        <button className="btn-icon-sm" onClick={handleImportClick} title="Import Script">
                            <Upload size={16} />
                        </button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            accept=".json"
                            onChange={handleImportFile}
                        />
                    </div>
                </div>

                {isCreating && (
                    <div className="create-script-inline">
                        <form onSubmit={handleCreate}>
                            <input
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Script name..."
                                autoFocus
                                className="inline-input"
                            />
                            <div className="inline-actions">
                                <button type="submit" className="btn-tiny btn-primary" disabled={creatingState}>Create</button>
                                <button type="button" className="btn-tiny" onClick={() => setIsCreating(false)}>Cancel</button>
                            </div>
                        </form>
                    </div>
                )}

                <div className="scripts-list">
                    {loading ? (
                        <div className="loading-spinner"></div>
                    ) : filteredScripts.length === 0 ? (
                        <div className="empty-message">No scripts found</div>
                    ) : (
                        filteredScripts.map(script => (
                            <div
                                key={script.name}
                                className={`script-item ${currentScript?.metadata?.name === script.name ? 'active' : ''}`}
                                onClick={() => {
                                    // Don't select if currently editing
                                    if (editingScriptName !== script.name) {
                                        onSelect(script.name)
                                    }
                                }}
                            >
                                <div className="script-icon">
                                    {script.is_ejected ? <Code2 size={14} className="text-info" /> : <FileCode size={14} />}
                                </div>
                                <div className="script-info">
                                    {editingScriptName === script.name ? (
                                        <div className="script-rename-edit">
                                            <input
                                                type="text"
                                                value={newRenamedName}
                                                onChange={(e) => {
                                                    setNewRenamedName(e.target.value)
                                                    setRenameError('')
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleRename()
                                                    if (e.key === 'Escape') cancelRename()
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                                autoFocus
                                                className="script-rename-input"
                                            />
                                            {renameError && <div className="rename-error">{renameError}</div>}
                                            <div className="rename-actions">
                                                <button
                                                    className="btn-tiny btn-primary"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleRename()
                                                    }}
                                                    disabled={isRenamingState}
                                                >
                                                    Save
                                                </button>
                                                <button
                                                    className="btn-tiny"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        cancelRename()
                                                    }}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="script-name-container">
                                                <div className="script-name">
                                                    {script.name}
                                                </div>
                                            </div>
                                            <div className="script-meta">
                                                {formatDate(script.updated_at)}
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div className="script-hover-actions">
                                    <button
                                        className="action-btn"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            startRename(script.name, e)
                                        }}
                                        title="Rename script"
                                    >
                                        <Edit2 size={12} />
                                    </button>
                                    <button
                                        className="action-btn"
                                        onClick={(e) => handleExport(script.name, e)}
                                        title="Export"
                                    >
                                        <Download size={12} />
                                    </button>
                                    <button
                                        className="action-btn delete"
                                        onClick={(e) => confirmDeleteScript(script.name, e)}
                                        title="Delete"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <ConfirmModal
                isOpen={confirmDelete.isOpen}
                title="Delete Script"
                message={`Are you sure you want to delete "${confirmDelete.scriptName}"?`}
                confirmLabel="Delete"
                isDestructive={true}
                onConfirm={handleDelete}
                onCancel={() => setConfirmDelete({ isOpen: false, scriptName: null })}
            />
        </div>
    )
}
