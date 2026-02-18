/**
 * Code Editor Component
 * 
 * Monaco Editor integration for Python code editing
 * with AI assistance integration.
 */

import { useRef, useImperativeHandle, forwardRef, useState, useEffect } from 'react'
import './CodeEditor.css'
import { FileCode } from 'lucide-react'

const CodeEditor = forwardRef(({
    code,
    onChange,
    scriptName,
    isRecording // Accept prop
}, ref) => {
    const editorRef = useRef(null)
    const [EditorComponent, setEditorComponent] = useState(null)
    const [useTextarea, setUseTextarea] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let mounted = true
        setLoading(true)

        import('@monaco-editor/react')
            .then(mod => {
                if (mounted) {
                    setEditorComponent(() => mod.default)
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

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
        insertCode: (text, forceRunFunction = false) => {
            if (!editorRef.current) {
                console.warn('[CodeEditor] insertCode called but editorRef is null')
                return
            }

            console.log('[CodeEditor] Inserting:', text)

            // Try Monaco path first
            if (!useTextarea && window.monaco && editorRef.current.getSelection) {
                try {
                    const editor = editorRef.current
                    const selection = editor.getSelection()
                    const Range = window.monaco.Range
                    const model = editor.getModel()
                    const lineCount = model.getLineCount()
                    const lastLineLength = model.getLineContent(lineCount).length

                    // Helper to determine insertion position inside 'def run(vnc):'
                    const findInsertionPosition = () => {
                        const lines = model.getValue().split('\n')
                        let runFunctionLine = -1

                        // Find "def run(vnc):" using simple string match to be robust
                        // We also check for variations in spacing
                        for (let i = 0; i < lines.length; i++) {
                            if (lines[i].match(/^\s*def\s+run\s*\(/)) {
                                runFunctionLine = i + 1 // 1-based
                                break
                            }
                        }

                        if (runFunctionLine !== -1) {
                            // Determine indentation from the def line
                            const defLine = lines[runFunctionLine - 1]
                            const baseIndentMatch = defLine.match(/^\s*/)
                            const baseIndentLength = baseIndentMatch ? baseIndentMatch[0].length : 0

                            let insertLine = runFunctionLine
                            let passLine = -1

                            // Look for end of function block
                            for (let i = runFunctionLine; i < lines.length; i++) {
                                const line = lines[i]

                                // Ignore empty lines or comments when determining the block end
                                if (line.trim() !== '' && !line.trim().startsWith('#')) {
                                    const currentIndentMatch = line.match(/^\s*/)
                                    const currentIndent = currentIndentMatch ? currentIndentMatch[0].length : 0

                                    // If we hit a line with same/less indentation, we hit the boundary (e.g. next function or __main__)
                                    if (currentIndent <= baseIndentLength) {
                                        break
                                    }
                                }

                                // Track 'pass' if we find it
                                if (line.trim() === 'pass') {
                                    passLine = i + 1
                                }

                                // This line is part of the block (or an empty/comment line within it)
                                insertLine = i + 1
                            }

                            // Optimization: Backtrack insertLine to the last non-empty line
                            // But ONLY if we didn't just break because of a boundary.
                            // Actually, it's safer to just append at the end of the detected block.
                            while (insertLine > runFunctionLine && lines[insertLine - 1].trim() === '') {
                                insertLine--
                            }

                            const indent = '    ' // Standard 4 spaces

                            // If we found 'pass', we should replace it, BUT only if it's the only logic
                            // If we have already inserted code, 'pass' might still be there if we failed to replace it previously?
                            // Actually, if we prefer valid code, we should replace 'pass' if it exists.
                            const hasPass = passLine !== -1

                            return {
                                lineNumber: insertLine,
                                column: 1,
                                indent: indent,
                                replacePass: hasPass,
                                replaceLine: hasPass ? passLine : insertLine // Use passLine if replacing
                            }
                        }
                        return null
                    }

                    let targetRange = new Range(
                        selection.startLineNumber,
                        selection.startColumn,
                        selection.endLineNumber,
                        selection.endColumn
                    )

                    let insertText = text + '\n'
                    let shouldUseRunFunction = forceRunFunction

                    if (!shouldUseRunFunction && selection.startLineNumber === 1 && selection.startColumn === 1) {
                        shouldUseRunFunction = true
                    }

                    if (shouldUseRunFunction) {
                        const pos = findInsertionPosition()
                        if (pos) {
                            console.log('[CodeEditor] Inserting into run() at line:', pos.lineNumber, 'replacePass:', pos.replacePass)
                            if (pos.replacePass) {
                                // Replace the 'pass' line completely
                                targetRange = new Range(pos.replaceLine, 1, pos.replaceLine, model.getLineContent(pos.replaceLine).length + 1)
                                // Handle multi-line text (e.g. wait + action)
                                insertText = text.split('\n')
                                    .map((line, i) => i === 0 && line === '' ? '' : pos.indent + line)
                                    .join('\n') + '\n'
                            } else {
                                // Insert at determined line (append)
                                // We want to insert AFTER the line at 'pos.lineNumber'.
                                targetRange = new Range(pos.lineNumber + 1, 1, pos.lineNumber + 1, 1)
                                // Handle multi-line text (ensure each line is indented)
                                insertText = text.split('\n')
                                    .map(line => line.trim() === '' ? '' : pos.indent + line)
                                    .join('\n') + '\n'
                            }
                        } else {
                            console.warn('[CodeEditor] Could not find run() function. Falling back to end of file.')
                            const lineCount = model.getLineCount()
                            const lastLineContent = model.getLineContent(lineCount)

                            // FORCE two newlines if we are appending to the end of a non-empty file
                            const prefix = lastLineContent.trim() === '' ? '' : '\n\n'

                            targetRange = new Range(lineCount, lastLineContent.length + 1, lineCount, lastLineContent.length + 1)
                            insertText = prefix + text + '\n'
                        }
                    }

                    editor.executeEdits('vnc-capture', [
                        {
                            range: targetRange,
                            text: insertText,
                            forceMoveMarkers: true
                        }
                    ])
                    console.log('[CodeEditor] Inserted into Monaco successfully')

                    if (targetRange.startLineNumber > lineCount) {
                        editor.revealLine(lineCount + 10)
                    } else {
                        editor.revealLine(targetRange.startLineNumber)
                    }

                    editor.focus()
                    return
                } catch (err) {
                    console.warn('Failed to insert into Monaco, falling back to textarea:', err)
                }
            }

            // Textarea fallback
            const ta = editorRef.current
            if (!ta) return

            let start = ta.selectionStart || 0
            if (start === 0 && ta.value.length > 0) {
                start = ta.value.length
            }

            const before = ta.value.substring(0, start)
            const after = ta.value.substring(start)
            const newVal = before + text + '\n' + after
            ta.value = newVal
            onChange(newVal)
            console.log('[CodeEditor] Inserted into Textarea successfully')
            ta.focus()
        }
    }), [useTextarea])

    const handleEditorMount = (editor, monaco) => {
        editorRef.current = editor
        window.monaco = monaco

        try {
            editor.updateOptions({
                fontSize: 14,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                minimap: { enabled: false },
                lineNumbers: 'on',
                roundedSelection: true,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 4,
                insertSpaces: true,
                wordWrap: 'on'
            })
        } catch (err) {
            console.warn('Failed to configure Monaco editor', err)
        }
    }

    const handleChange = (value) => {
        onChange(value || '')
    }

    return (
        <div className="code-editor">
            {scriptName && (
                <div className="editor-header">
                    <div className="editor-title">
                        <span className="editor-icon"><FileCode size={16} /></span>
                        <span>{scriptName.endsWith('.py') ? scriptName : `${scriptName}.py`}</span>
                    </div>
                </div>
            )}

            <div className="editor-container">
                {loading ? (
                    <div className="editor-loading">Loading editor...</div>
                ) : useTextarea ? (
                    <textarea
                        ref={editorRef}
                        className="editor-textarea"
                        value={code}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder="# Write your Python code here..."
                    />
                ) : EditorComponent ? (
                    <EditorComponent
                        height="100%"
                        language="python"
                        theme="vs-dark"
                        value={code}
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
                            padding: { top: 8 }
                        }}
                    />
                ) : (
                    <div className="editor-error">Failed to load editor</div>
                )}
            </div>
        </div>
    )
})

CodeEditor.displayName = 'CodeEditor'
export default CodeEditor
