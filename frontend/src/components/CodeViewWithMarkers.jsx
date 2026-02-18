/**
 * Code View With Markers Component
 * 
 * Shows generated code (read-only) and manual code (editable)
 * with visual boundary between them.
 */

import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import './CodeViewWithMarkers.css'

const CodeViewWithMarkers = forwardRef(({
    generatedCode = '',
    manualCode = '',
    onManualCodeChange = () => { },
    steps = [],
    isRecording = false,
    generatedLineCount = 0,
}, ref) => {
    const editorRef = useRef(null)
    const [EditorComponent, setEditorComponent] = useState(null)
    const [useTextarea, setUseTextarea] = useState(false)
    const [loading, setLoading] = useState(true)

    // Load Monaco Editor
    useEffect(() => {
        let mounted = true
        setLoading(true)

        import('@monaco-editor/react')
            .then(mod => {
                if (mounted) {
                    setEditorComponent(() => mod.default)
                    setUseTextarea(false)
                    setLoading(false)
                }
            })
            .catch(err => {
                console.warn('Monaco editor failed to load, using textarea fallback', err)
                if (mounted) {
                    setUseTextarea(true)
                    setLoading(false)
                }
            })

        return () => { mounted = false }
    }, [])

    // Expose insertCode method via ref
    useImperativeHandle(ref, () => ({
        insertCode: (text) => {
            if (!editorRef.current) return

            if (useTextarea) {
                // For textarea fallback
                const textarea = editorRef.current
                const start = textarea.selectionStart
                const end = textarea.selectionEnd
                const before = textarea.value.substring(0, start)
                const after = textarea.value.substring(end)
                const newValue = before + text + after
                
                // Only trigger onChange if it's manual code area
                if (start >= generatedCode.length) {
                    onManualCodeChange(newValue.slice(generatedCode.length))
                }
            } else if (window.monaco && editorRef.current) {
                // For Monaco editor - insert at cursor
                try {
                    const editor = editorRef.current
                    const position = editor.getPosition()
                    const range = new window.monaco.Range(
                        position.lineNumber,
                        position.column,
                        position.lineNumber,
                        position.column
                    )
                    const operation = {
                        range: range,
                        text: text + '\n',
                        forceMoveMarkers: true
                    }
                    editor.executeEdits('insertCode', [operation])
                } catch (err) {
                    console.error('Failed to insert code', err)
                }
            }
        }
    }), [useTextarea, generatedCode, onManualCodeChange])

    const fullCode = generatedCode + '\n' + manualCode
    const generatedLineNum = generatedCode.split('\n').length

    const handleChange = (value) => {
        // Extract manual code (everything after generated)
        const lines = value.split('\n')
        const manualLines = lines.slice(generatedLineNum)
        const newManual = manualLines.join('\n')
        onManualCodeChange(newManual)
    }

    const handleEditorMount = (editor) => {
        editorRef.current = editor

        // Mark generated lines as read-only
        if (window.monaco) {
            try {
                editor.onDidChangeModelContent(() => {
                    // Update manual code as user types
                })
            } catch (err) {
                console.warn('Failed to setup editor decorations', err)
            }
        }
    }

    if (loading) {
        return (
            <div className="code-view-loading">
                <p>Loading editor...</p>
            </div>
        )
    }

    return (
        <div className="code-view-with-markers">
            {useTextarea ? (
                // Textarea fallback
                <div className="code-view-fallback">
                    <div className="code-generated-section">
                        <div className="code-section-label">
                            Auto-generated code (read-only)
                        </div>
                        <textarea
                            value={generatedCode}
                            readOnly
                            className="code-textarea-generated"
                        />
                    </div>

                    <div className="code-section-divider">
                        <span>↓ Your custom code below</span>
                    </div>

                    <div className="code-manual-section">
                        <div className="code-section-label">
                            Your code (editable)
                        </div>
                        <textarea
                            ref={editorRef}
                            value={manualCode}
                            onChange={(e) => onManualCodeChange(e.target.value)}
                            className="code-textarea-manual"
                            placeholder="# Add your custom code here..."
                        />
                    </div>
                </div>
            ) : EditorComponent ? (
                // Monaco Editor
                <EditorComponent
                    height="100%"
                    language="python"
                    theme="vs-dark"
                    value={fullCode}
                    onChange={handleChange}
                    onMount={handleEditorMount}
                    options={{
                        fontSize: 14,
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        minimap: { enabled: false },
                        lineNumbers: 'on',
                        roundedSelection: true,
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        tabSize: 4,
                        insertSpaces: true,
                        wordWrap: 'on',
                        padding: { top: 16 },
                        readOnlyRanges: [
                            {
                                startLineNumber: 1,
                                endLineNumber: generatedLineNum,
                                id: 'generated-section'
                            }
                        ]
                    }}
                />
            ) : (
                <div className="code-view-error">
                    Failed to load code editor
                </div>
            )}

            {/* Recording indicator */}
            {isRecording && (
                <div className="recording-indicator">
                    <span className="recording-pulse"></span>
                    Recording enabled - VNC interactions will insert code
                </div>
            )}
        </div>
    )
})

CodeViewWithMarkers.displayName = 'CodeViewWithMarkers'
export default CodeViewWithMarkers
