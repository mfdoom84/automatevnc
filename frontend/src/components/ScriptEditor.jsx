/**
 * ScriptEditor – Code-only IDE view for a script.
 * Single code buffer, Record button; no steps view or mode toggle.
 */

import React, { useRef, useImperativeHandle, forwardRef } from 'react'
import './ScriptEditor.css'
import CodeEditor from './CodeEditor'
import { Disc, Square, Play, Save, Plug, Unplug } from 'lucide-react'

const ScriptEditor = forwardRef(({
    scriptName,
    code,
    onCodeChange,
    isRecording = false,
    onToggleRecording = () => { },
    onRun = () => { },
    onSave = () => { },
    connected = false,
    onConnect = () => { },
    onDisconnect = () => { },
    vncHost = '',
}, ref) => {
    const editorRef = useRef(null)

    useImperativeHandle(ref, () => ({
        insertCode: (text, forceRunFunction) => editorRef.current?.insertCode?.(text, forceRunFunction)
    }), [])

    return (
        <div className="script-editor">
            <div className="script-editor-header">
                <div className="script-editor-actions">
                    <button
                        className={`script-editor-action-btn ${connected ? 'connected' : ''}`}
                        onClick={connected ? onDisconnect : onConnect}
                        title={connected ? `Disconnect from ${vncHost}` : 'Connect to VNC'}
                    >
                        {connected ? (
                            <><Unplug size={14} /> Disconnect</>
                        ) : (
                            <><Plug size={14} /> Connect</>
                        )}
                    </button>
                    <button
                        className="script-editor-action-btn"
                        onClick={onRun}
                        title="Run Script (Visual)"
                    >
                        <Play size={14} className="text-success" /> Run
                    </button>
                    <button
                        className="script-editor-action-btn"
                        onClick={onSave}
                        title="Save Script (Ctrl+S)"
                    >
                        <Save size={14} /> Save
                    </button>
                    <span className={`recording-status ${isRecording ? 'visible' : ''}`}>
                        {isRecording ? "Recording..." : ""}
                    </span>
                </div>
                <div className="script-editor-title">
                    <span className="script-editor-name">
                        {scriptName ? (scriptName.endsWith('.py') ? scriptName : `${scriptName}.py`) : 'Untitled'}
                    </span>
                </div>
            </div >
            <div className="script-editor-body">
                <CodeEditor
                    ref={editorRef}
                    code={code}
                    onChange={onCodeChange}
                    isRecording={isRecording}
                />
            </div>
        </div >
    )
})

ScriptEditor.displayName = 'ScriptEditor'
export default ScriptEditor
