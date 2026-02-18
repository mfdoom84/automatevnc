import React, { useState, useCallback, useEffect, useRef } from 'react'
import './App.css'
import VNCViewer from './components/VNCViewer'
import ScriptEditor from './components/ScriptEditor'
import ConnectionDialog from './components/ConnectionDialog'
import ProjectExplorer from './components/ProjectExplorer'
import AIAssistant from './components/AIAssistant'
import SettingsPanel from './components/SettingsPanel'
import RunHistory from './components/RunHistory'
import ConfirmModal from './components/ConfirmModal'
import SnippetLibrary from './components/SnippetLibrary'
import TemplateLibrary from './components/TemplateLibrary'
import ApiDocs from './components/ApiDocs'
import { scriptsApi, runsApi } from './services/api'
import { generateCode } from './utils/codeGenerator'
import ExecutionLogs from './components/ExecutionLogs'
import {
    Zap, Save, Monitor, Code, Play, Settings, ChevronRight, ChevronLeft,
    Plus, FolderOpen, Trash2, Cpu, Bot, ClipboardList, Info, X, Image as ImageIcon,
    MonitorPlay, History, Layers, Layout, Terminal, Book, ChevronDown, BookOpen, Files
} from 'lucide-react'


function App() {
    const editorRef = useRef(null)
    const codeByScriptRef = useRef({})

    // Connection state
    const [connected, setConnected] = useState(false)
    const [vncConfig, setVncConfig] = useState(null)
    const [showConnectionDialog, setShowConnectionDialog] = useState(false)
    const [pendingRecordStart, setPendingRecordStart] = useState(false) // Auto-start recording after connect

    // Script state (code-only)
    const [currentScript, setCurrentScript] = useState(null)
    const [code, setCode] = useState('')
    const [isRecording, setIsRecording] = useState(false)
    const [isPaused, setIsPaused] = useState(false)

    // Tab management
    const [openScripts, setOpenScripts] = useState([])
    const [dirtyScripts, setDirtyScripts] = useState([])

    // Close confirmation dialog
    const [closeConfirm, setCloseConfirm] = useState({
        isOpen: false,
        scriptName: null
    })

    // UI state
    const [rightPanelTab, setRightPanelTab] = useState('logs') // Default to logs now
    const [lastRunId, setLastRunId] = useState(null)
    const [isRunActive, setIsRunActive] = useState(false)
    const [centerView, setCenterView] = useState('code')
    const [snippetsExpanded, setSnippetsExpanded] = useState(false)
    const [templatesExpanded, setTemplatesExpanded] = useState(false)
    const [templatesVersion, setTemplatesVersion] = useState(0)

    // Handle VNC connection
    const handleConnect = useCallback((config) => {
        setVncConfig(config)
        setConnected(true)
        setShowConnectionDialog(false)
        setCenterView('live') // Auto-switch to Live View on connect

        // Smart Start: If we were waiting to record, start now
        if (pendingRecordStart) {
            setCenterView('live')
            setIsRecording(true)
            setPendingRecordStart(false)
        }

        // Update script credentials with the connection info
        if (currentScript && code) {
            let newCode = code

            // Try to update os.environ.get patterns first (boilerplate)
            const hasEnvironPatterns = code.includes('os.environ.get("VNC_HOST"') ||
                code.includes('os.environ.get("VNC_PORT"') ||
                code.includes('os.environ.get("VNC_PASSWORD"')

            if (hasEnvironPatterns) {
                // Update the DEFAULT VALUES inside environ.get() patterns (preserves the pattern)
                // os.environ.get("VNC_HOST", "localhost") → os.environ.get("VNC_HOST", "newhost")
                newCode = newCode.replace(/os\.environ\.get\("VNC_HOST",\s*["'][^"']*["']\)/g, `os.environ.get("VNC_HOST", "${config.host}")`)

                // int(os.environ.get("VNC_PORT", 5900)) → int(os.environ.get("VNC_PORT", newport))
                newCode = newCode.replace(/(?:int\s*\()?\s*os\.environ\.get\("VNC_PORT",\s*\d+\)(?:\s*\))?/g, `int(os.environ.get("VNC_PORT", ${config.port}))`)

                // os.environ.get("VNC_PASSWORD", None) → os.environ.get("VNC_PASSWORD", "newpass")
                if (config.password) {
                    newCode = newCode.replace(/os\.environ\.get\("VNC_PASSWORD",\s*None\)/g, `os.environ.get("VNC_PASSWORD", "${config.password}")`)
                }
            } else {
                // Try to update direct assignment patterns
                // HOST = "..."
                // PORT = ...
                // PASSWORD = "..."
                const hostExists = /HOST\s*=\s*["'][^"']*["']/.test(code)
                const portExists = /PORT\s*=\s*(?:int\()?\s*\d+/.test(code)
                const passExists = /PASSWORD\s*=\s*["'][^"']*["']/.test(code)

                if (hostExists) {
                    newCode = newCode.replace(/HOST\s*=\s*["'][^"']*["']/g, `HOST = "${config.host}"`)
                } else {
                    newCode = newCode.replace(/# Connection configuration/g, `# Connection configuration\nHOST = "${config.host}"`)
                }

                if (portExists) {
                    newCode = newCode.replace(/PORT\s*=\s*(?:int\()?\s*\d+(?:\s*\))?/g, `PORT = int(${config.port})`)
                } else {
                    newCode = newCode.replace(/HOST\s*=\s*"[^"]*"/g, (match) => `${match}\nPORT = int(${config.port})`)
                }

                if (config.password) {
                    if (passExists) {
                        newCode = newCode.replace(/PASSWORD\s*=\s*["'][^"']*["']/g, `PASSWORD = "${config.password}"`)
                    } else {
                        newCode = newCode.replace(/PORT\s*=\s*(?:int\()?\s*\d+(?:\s*\))?/g, (match) => `${match}\nPASSWORD = "${config.password}"`)
                    }
                }
            }

            if (newCode !== code) {
                setCode(newCode)
                codeByScriptRef.current[currentScript.metadata.name] = newCode
                setDirtyScripts(prev => prev.includes(currentScript.metadata.name) ? prev : [...prev, currentScript.metadata.name])
            }
        }
    }, [pendingRecordStart, currentScript, code])

    // Handle disconnection
    const handleDisconnect = useCallback(() => {
        setConnected(false)
        setVncConfig(null)
        setShowConnectionDialog(false)
        setIsRunActive(false)
        setCenterView('code')
    }, [])

    // Handle screen size change (for VNC viewer)
    const handleScreenSize = useCallback((width, height) => { }, [])

    // Toggle recording (VNC actions insert code at cursor)
    const toggleRecording = useCallback(() => {
        if (!connected && !isRecording) {
            // Smart Start: Connect first, then record
            setPendingRecordStart(true)
            setShowConnectionDialog(true)
            return
        }

        if (connected && !isRecording) {
            // Switch to live view if not already
            if (centerView !== 'live') {
                setCenterView('live')
            }
            // Auto switch to logs tab
            setRightPanelTab('logs')
            setIsRecording(true)
            setIsPaused(false)
        } else if (isRecording) {
            // Stop recording
            setIsRecording(false)
            setIsPaused(false)
        }
    }, [connected, isRecording, centerView])

    const pauseRecording = useCallback(() => {
        setIsPaused(prev => !prev)
    }, [])

    const handleStopRun = useCallback(async () => {
        if (!lastRunId) return

        try {
            await runsApi.cancel(lastRunId)
            setIsRunActive(false)
            console.log("Run stopped:", lastRunId)
        } catch (error) {
            console.error("Failed to stop run:", error)
        }
    }, [lastRunId])

    // Monitor run status and update isRunActive
    useEffect(() => {
        if (!lastRunId || !isRunActive) return

        const pollInterval = setInterval(async () => {
            try {
                const run = await runsApi.get(lastRunId)
                if (run.status !== 'running' && run.status !== 'queued') {
                    setIsRunActive(false)
                    clearInterval(pollInterval)
                }
            } catch (error) {
                console.error("Failed to check run status:", error)
            }
        }, 2000)

        return () => clearInterval(pollInterval)
    }, [lastRunId, isRunActive])

    // Create new script (code-only: boilerplate)
    const createNewScript = useCallback(async (name, description = '') => {
        try {
            const script = await scriptsApi.create({ name, description, steps: [] })
            const boilerplate = generateCode([], name, description)
            codeByScriptRef.current[name] = boilerplate
            setCurrentScript(script)
            setCode(boilerplate)
            setCenterView('code')
            setOpenScripts(prev => (prev.includes(name) ? prev : [...prev, name]))
            return script
        } catch (error) {
            console.error('Failed to create script:', error)
            throw error
        }
    }, [])

    // Load script: use in-memory code if we have unsaved edits, else load from API
    const loadScript = useCallback(async (name) => {
        try {
            setOpenScripts(prev => (prev.includes(name) ? prev : [...prev, name]))
            const script = await scriptsApi.get(name)
            setCurrentScript(script)
            const fullCode = script.code || generateCode(
                script.steps || [],
                name,
                script.metadata?.description || ''
            )
            const hadCached = codeByScriptRef.current[name] !== undefined
            const codeToShow = codeByScriptRef.current[name] ?? fullCode
            codeByScriptRef.current[name] = codeToShow
            setCode(codeToShow)
            setCenterView('code')
            if (!hadCached) {
                setDirtyScripts(prev => prev.filter(s => s !== name))
            }
        } catch (error) {
            console.error('Failed to load script:', error)
        }
    }, [])

    // Close script tab
    const closeScriptTab = useCallback((scriptName) => {
        if (dirtyScripts.includes(scriptName)) {
            setCloseConfirm({ isOpen: true, scriptName })
            return
        }
        delete codeByScriptRef.current[scriptName]
        setOpenScripts(prev => prev.filter(s => s !== scriptName))
        if (currentScript?.metadata.name === scriptName) {
            const remaining = openScripts.filter(s => s !== scriptName)
            if (remaining.length > 0) {
                loadScript(remaining[0])
            } else {
                setCurrentScript(null)
                setCode('')
            }
        }
    }, [dirtyScripts, currentScript, openScripts, loadScript])

    // Save current script (code only)
    const saveScript = useCallback(async () => {
        if (!currentScript) return
        try {
            await scriptsApi.update(currentScript.metadata.name, { code })
            setDirtyScripts(prev => prev.filter(s => s !== currentScript.metadata.name))
        } catch (error) {
            console.error('Failed to save script:', error)
        }
    }, [currentScript, code])

    // Helper: Extract VNC credentials from script code
    const extractCredentialsFromCode = useCallback((scriptCode) => {
        // Strategy 1: os.environ.get pattern (generated by boilerplate)
        let hostMatch = scriptCode.match(/VNC_HOST",\s*["']([^"']+)["']\)/)
        let portMatch = scriptCode.match(/VNC_PORT",\s*(\d+)\)/)
        let passMatch = scriptCode.match(/VNC_PASSWORD",\s*["']([^"']+)["']\)/)

        // Strategy 2: Direct assignment (USER edited)
        // HOST = "localhost"
        // PORT = 5900
        // PORT = int(5900)
        // PASSWORD = "asdf"
        if (!hostMatch) hostMatch = scriptCode.match(/HOST\s*=\s*["']([^"']+)["']/)
        if (!portMatch) portMatch = scriptCode.match(/PORT\s*=\s*(?:int\()?\s*(\d+)/)
        if (!passMatch) passMatch = scriptCode.match(/PASSWORD\s*=\s*["']([^"']+)["']/)

        if (hostMatch && portMatch && passMatch) {
            return {
                host: hostMatch[1],
                port: parseInt(portMatch[1], 10),
                password: passMatch[1]
            }
        }

        // If host and port are found but password is missing, return null to force dialog
        if (hostMatch && portMatch) {
            return null
        }

        return null
    }, [])

    // Handle opening connection dialog (with auto-filled credentials from script)
    const handleOpenConnectionDialog = useCallback(() => {
        const credentials = extractCredentialsFromCode(code)
        if (credentials) {
            handleConnect(credentials)
        } else {
            setShowConnectionDialog(true)
        }
    }, [code, extractCredentialsFromCode, handleConnect])

    // Run Script (Visual Mode)
    const handleRunScript = useCallback(async () => {
        if (!currentScript) return

        // Auto-save before running
        await saveScript()

        // Extract credentials from code if not connected
        let configToUse = vncConfig
        let justConnected = false

        if (!connected) {
            const credentials = extractCredentialsFromCode(code)

            if (credentials) {
                // Don't auto-connect to localhost/127.0.0.1 if we know it might fail in docker? 
                // Actually backend handles resolution. Frontend needs to connect via proxy.
                // The proxy handles resolution too now? Yes.

                console.log("[App] Auto-connecting to:", credentials)
                handleConnect(credentials)
                configToUse = credentials
                justConnected = true
            } else {
                console.warn("Could not find VNC credentials in script to auto-connect")
                setShowConnectionDialog(true)
                return
            }
        }

        // Switch to Live View
        setCenterView('live')

        try {
            // Trigger run via API
            const run = await runsApi.trigger(currentScript.metadata.name, configToUse)
            setLastRunId(run.id)
            setIsRunActive(true)
            setRightPanelTab('logs')
            console.log("Run started:", run.id)
        } catch (error) {
            console.error("Failed to start run:", error)
        }
    }, [currentScript, saveScript, connected, vncConfig, code, handleConnect])

    // Handle close confirmation
    const handleCloseConfirm = useCallback(async (action) => {
        const scriptName = closeConfirm.scriptName

        if (action === 'save') {
            await saveScript()
            setDirtyScripts(prev => prev.filter(s => s !== scriptName))
        } else if (action === 'discard') {
            setDirtyScripts(prev => prev.filter(s => s !== scriptName))
        } else {
            setCloseConfirm({ isOpen: false, scriptName: null })
            return
        }

        delete codeByScriptRef.current[scriptName]
        setOpenScripts(prev => prev.filter(s => s !== scriptName))
        if (currentScript?.metadata.name === scriptName) {
            const remaining = openScripts.filter(s => s !== scriptName)
            if (remaining.length > 0) {
                loadScript(remaining[0])
            } else {
                setCurrentScript(null)
                setCode('')
            }
        }
        setCloseConfirm({ isOpen: false, scriptName: null })
    }, [closeConfirm, currentScript, openScripts, loadScript, saveScript])

    // Track recording timing
    const lastRecordTimeRef = useRef(null)

    // Reset timer when toggling recording
    useEffect(() => {
        if (isRecording) {
            lastRecordTimeRef.current = Date.now()
        } else {
            lastRecordTimeRef.current = null
        }
    }, [isRecording])

    // VNC interaction → insert code at cursor when recording and script open
    const handleVNCInteraction = useCallback((stepData) => {
        console.log('[App] VNC Interaction:', stepData, 'Recording:', isRecording, 'Paused:', isPaused)
        if (!isRecording || isPaused || !editorRef.current?.insertCode) {
            return
        }

        let codeToInsert = ''

        // Use delay_before from VNCViewer if available (more accurate),
        // otherwise fall back to our own timing calculation
        if (stepData.delay_before !== undefined && stepData.delay_before !== null && stepData.delay_before > 0.1) {
            // Insert wait based on recorded timing
            const waitTime = stepData.delay_before
            console.log(`[App] Using recorded delay: ${waitTime}s`)
            codeToInsert += `vnc.wait(${waitTime})\n`
        } else if (lastRecordTimeRef.current) {
            // Fallback to our own timing if no delay_before
            const now = stepData.timestamp || Date.now()
            const diffSeconds = (now - lastRecordTimeRef.current) / 1000

            // Only insert wait if delay is significant (> 1s) and realistic (< 30s)
            if (diffSeconds > 1.0 && diffSeconds < 30) {
                // Round to 1 decimal place
                const waitTime = Math.round(diffSeconds * 10) / 10
                console.log(`[App] Using calculated delay: ${waitTime}s`)
                codeToInsert += `vnc.wait(${waitTime})\n`
            }
            lastRecordTimeRef.current = now
        } else {
            // First action after start recording
            lastRecordTimeRef.current = stepData.timestamp || Date.now()
        }

        let snippet = ''
        switch (stepData.type) {
            case 'click':
                snippet = `vnc.click(${stepData.x}, ${stepData.y})`
                break
            case 'right_click':
                snippet = `vnc.right_click(${stepData.x}, ${stepData.y})`
                break
            case 'type':
                snippet = `vnc.type(${JSON.stringify(stepData.text)})`
                break
            case 'key_press':
                snippet = `vnc.press("${stepData.keys[0]}")`
                break
            case 'key_combo':
                snippet = `vnc.key_combo(${JSON.stringify(stepData.keys || [])})`
                break
            case 'wait_for_image':
                // Async template creation for assertions
                (async () => {
                    try {
                        const res = await scriptsApi.createSmartTemplate(
                            currentScript.metadata.name,
                            stepData.template_data
                        )
                        const filename = res.filename
                        // If width/height are present, calculate center, otherwise use x,y directly
                        const hintX = (stepData.width != null && stepData.height != null) ? Math.round(stepData.x + stepData.width / 2) : Math.round(stepData.x)
                        const hintY = (stepData.width != null && stepData.height != null) ? Math.round(stepData.y + stepData.height / 2) : Math.round(stepData.y)
                        const snippet = `vnc.wait_for_image("${filename}", timeout=${stepData.timeout || 30.0}, hint=(${hintX}, ${hintY}))`
                        editorRef.current?.insertCode(codeToInsert + snippet, true)
                        setTemplatesVersion(v => v + 1)
                    } catch (err) {
                        console.error("Failed to create assertion template:", err)
                        editorRef.current?.insertCode(codeToInsert + `# Failed to capture assertion: ${err.message}`, true)
                    }
                })()
                return
            case 'wait_for_text':
                const hintArg = (stepData.x != null && stepData.y != null) ? `, hint=(${stepData.x}, ${stepData.y})` : ''
                snippet = `vnc.wait_for_text(${JSON.stringify(stepData.text || 'Success')}, timeout=${stepData.timeout || 30}${hintArg})`
                break
            case 'wait':
                snippet = `vnc.wait(${stepData.timeout || 5})`
                break
            case 'smart_click':
                // Async template creation
                (async () => {
                    try {
                        const res = await scriptsApi.createSmartTemplate(
                            currentScript.metadata.name,
                            stepData.smartTemplate
                        )
                        const filename = res.filename

                        const hX = Math.round(stepData.x)
                        const hY = Math.round(stepData.y)

                        // Single click with timeout - waits for template and clicks in one step
                        let code = ''
                        if (stepData.originalType === 'click') {
                            code = `vnc.click("${filename}", timeout=30.0, hint=(${hX}, ${hY}))`
                        } else if (stepData.originalType === 'right_click') {
                            code = `vnc.right_click("${filename}", timeout=30.0, hint=(${hX}, ${hY}))`
                        } else if (stepData.originalType === 'double_click') {
                            code = `vnc.double_click("${filename}", timeout=30.0, hint=(${hX}, ${hY}))`
                        }

                        editorRef.current?.insertCode(codeToInsert + code, true)
                        setTemplatesVersion(v => v + 1)
                    } catch (err) {
                        console.error("Failed to create smart template:", err)
                        // Fallback to coordinates
                        editorRef.current?.insertCode(codeToInsert + `vnc.click(${stepData.x}, ${stepData.y})`, true)
                    }
                })()
                // Return early for async
                return
            default:
                return
        }

        if (snippet) {
            codeToInsert += snippet
            editorRef.current.insertCode(codeToInsert, true)
        }


    }, [isRecording, isPaused, currentScript])

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Ctrl/Cmd + Key shortcuts
            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 's':
                        e.preventDefault()
                        saveScript()
                        break
                    case 'p':
                        e.preventDefault()
                        setShowConnectionDialog(true)
                        break
                }
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [saveScript, currentScript])

    const isZenMode = !connected && currentScript

    return (
        <div className="app">
            {/* Header */}
            <header className="app-header">
                <div className="header-left">
                    <h1 className="logo">
                        <span className="logo-icon"><Zap size={24} fill="currentColor" /></span>
                        AutoVNC
                    </h1>
                    {connected && (
                        <div className="vnc-status" title={`Connected to ${vncConfig?.host}`}>
                            <span className="status-dot online"></span>
                            <span className="status-text">{vncConfig?.host}</span>
                        </div>
                    )}
                </div>

                <div className="header-right">
                    {currentScript && (
                        <>
                            {/* Actions moved to Script Editor */}
                        </>
                    )}
                    <a
                        href="/docs"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-ghost"
                        title="API Documentation"
                    >
                        <Book size={18} /> API
                    </a>
                </div>
            </header>

            {/* Script tabs + Live View tab when connected */}
            {(openScripts.length > 0 || connected) && (
                <div className="full-tabs-bar">
                    <div className="script-tabs-inline">
                        {openScripts.map(name => (
                            <div
                                key={name}
                                className={`script-tab ${currentScript?.metadata?.name === name && centerView === 'code' ? 'active' : ''}`}
                                onClick={() => {
                                    if (currentScript && currentScript.metadata.name !== name) {
                                        codeByScriptRef.current[currentScript.metadata.name] = code
                                    }
                                    loadScript(name)
                                    setCenterView('code')
                                }}
                            >
                                <span className="script-tab-name">{name}</span>
                                {dirtyScripts.includes(name) && <span className="dirty-indicator" />}
                                <button
                                    className="script-tab-close"
                                    onClick={(e) => { e.stopPropagation(); closeScriptTab(name) }}
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                        {connected && (
                            <div
                                className={`script-tab live-view-tab ${centerView === 'live' ? 'active' : ''}`}
                                onClick={() => setCenterView('live')}
                            >
                                <Monitor size={14} />
                                <span className="script-tab-name">Live View</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Main Content */}
            <main className={`app-main ${isZenMode ? 'zen-mode' : ''}`}>
                {/* Left sidebar: Scripts + Snippets in one scrollable view */}
                <aside className="left-panel sidebar-mode">
                    <div className="sidebar-content">
                        <section className="sidebar-section">
                            <h3 className="sidebar-section-title">
                                <Files size={14} /> Scripts
                            </h3>
                            <ProjectExplorer
                                currentScript={currentScript}
                                onSelect={loadScript}
                                onCreate={createNewScript}
                            />
                        </section>
                        <section className={`sidebar-section templates-section ${templatesExpanded ? 'expanded' : ''}`}>
                            <h3
                                className="sidebar-section-title toggle"
                                onClick={() => setTemplatesExpanded((v) => !v)}
                                title={templatesExpanded ? 'Collapse Templates' : 'Expand Templates'}
                            >
                                {templatesExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <ImageIcon size={14} /> Templates
                            </h3>
                            <div className="templates-section-content">
                                <TemplateLibrary
                                    scriptName={currentScript?.metadata?.name}
                                    onInsert={(snippet) => editorRef.current?.insertCode(snippet)}
                                    version={templatesVersion}
                                />
                            </div>
                        </section>
                        <section className={`sidebar-section snippets-section ${snippetsExpanded ? 'expanded' : ''}`}>
                            <h3
                                className="sidebar-section-title toggle"
                                onClick={() => setSnippetsExpanded((v) => !v)}
                                title={snippetsExpanded ? 'Collapse Snippets' : 'Expand Snippets'}
                            >
                                {snippetsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <BookOpen size={14} /> Snippets
                            </h3>
                            <div className="snippets-section-content">
                                <SnippetLibrary onInsert={(snippet) => editorRef.current?.insertCode(snippet)} />
                            </div>
                        </section>
                    </div>
                </aside>

                {/* Center: Code editor or Live View (VNC) */}
                <section className="workspace-editor">
                    <div className={`workspace-content ${centerView !== 'live' ? 'hidden' : ''}`}>
                        <div className="vnc-container">
                            {connected ? (
                                <VNCViewer
                                    host={vncConfig?.host}
                                    port={vncConfig?.port}
                                    password={vncConfig?.password}
                                    onDisconnect={handleDisconnect}
                                    onScreenSize={handleScreenSize}
                                    onInteraction={handleVNCInteraction}
                                    isRecording={isRecording}
                                    isPaused={isPaused}
                                    onToggleRecording={toggleRecording}
                                    onPauseRecording={pauseRecording}
                                    isRunning={isRunActive}
                                    onStopRun={handleStopRun}
                                />
                            ) : (
                                <div className="vnc-placeholder">
                                    <div className="placeholder-content">
                                        <span className="placeholder-icon"><Monitor size={64} strokeWidth={1.5} /></span>
                                        <h2>Not Connected</h2>
                                        <p>Use the <strong>Connect</strong> button in the Script Editor toolbar to start a VNC session.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={`workspace-content ${centerView !== 'code' ? 'hidden' : ''}`}>
                        {currentScript ? (
                            <ScriptEditor
                                ref={editorRef}
                                scriptName={currentScript.metadata?.name}
                                code={code}
                                onCodeChange={(newCode) => {
                                    if (newCode === code) return
                                    setCode(newCode)
                                    if (currentScript) {
                                        codeByScriptRef.current[currentScript.metadata.name] = newCode
                                        setDirtyScripts(prev => prev.includes(currentScript.metadata.name) ? prev : [...prev, currentScript.metadata.name])
                                    }
                                }}
                                isRecording={isRecording}
                                onToggleRecording={toggleRecording}
                                onRun={handleRunScript}
                                onSave={saveScript}
                                connected={connected}
                                onConnect={handleOpenConnectionDialog}
                                onDisconnect={handleDisconnect}
                                vncHost={vncConfig?.host}
                            />
                        ) : (
                            <div className="welcome-placeholder">
                                <div className="placeholder-content">
                                    <span className="placeholder-icon"><Zap size={64} strokeWidth={1.5} /></span>
                                    <h2>Open or create a script</h2>
                                    <p>Use <strong>Scripts</strong> on the left to open or create a script. Then use the toolbar to connect and record actions.</p>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className={`workspace-content ${centerView !== 'docs' ? 'hidden' : ''}`}>
                        <ApiDocs />
                    </div>
                </section>

                {/* Right Panel (Toolbox) - Always visible */}
                <aside className="right-panel">
                    <div className="panel-tabs-header">
                        <button
                            className={`panel-tab ${rightPanelTab === 'ai' ? 'active' : ''}`}
                            onClick={() => setRightPanelTab('ai')}
                        >
                            <Bot size={14} className="mr-1" /> AI
                        </button>
                        <button
                            className={`panel-tab ${rightPanelTab === 'logs' ? 'active' : ''}`}
                            onClick={() => setRightPanelTab('logs')}
                        >
                            <Terminal size={14} className="mr-1" /> Logs
                        </button>
                        <button
                            className={`panel-tab ${rightPanelTab === 'history' ? 'active' : ''}`}
                            onClick={() => setRightPanelTab('history')}
                        >
                            <ClipboardList size={14} className="mr-1" /> History
                        </button>
                        <button
                            className={`panel-tab ${rightPanelTab === 'settings' ? 'active' : ''}`}
                            onClick={() => setRightPanelTab('settings')}
                        >
                            <Settings size={14} className="mr-1" /> Settings
                        </button>
                    </div>

                    <div className="panel-content">
                        {rightPanelTab === 'ai' && (
                            <AIAssistant
                                mode="code"
                                code={code}
                                onApplyCode={setCode}
                                isRecording={isRecording}
                            />
                        )}
                        {rightPanelTab === 'logs' && (
                            <ExecutionLogs
                                runId={lastRunId}
                                isRecording={isRecording}
                            />
                        )}
                        {rightPanelTab === 'history' && (
                            <RunHistory />
                        )}
                        {rightPanelTab === 'settings' && (
                            <SettingsPanel />
                        )}
                    </div>
                </aside>
            </main>

            {/* Modals */}
            {showConnectionDialog && (
                <ConnectionDialog
                    onConnect={handleConnect}
                    onClose={() => setShowConnectionDialog(false)}
                />
            )}

            {/* Close Script Confirmation Dialog */}
            <ConfirmModal
                isOpen={closeConfirm.isOpen}
                title="Unsaved Changes"
                message={`"${closeConfirm.scriptName}" has unsaved changes. Save before closing?`}
                confirmLabel="Save"
                cancelLabel="Cancel"
                onConfirm={() => handleCloseConfirm('save')}
                onDiscard={() => handleCloseConfirm('discard')}
                onCancel={() => handleCloseConfirm('cancel')}
                isDestructive={false}
            />

        </div>
    )
}

export default App
