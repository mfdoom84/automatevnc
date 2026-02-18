import React from 'react'
import { X, Circle } from 'lucide-react'
import './ScriptTabs.css'

export default function ScriptTabs({
    openScripts,
    currentScriptName,
    dirtyScripts,
    onSelectScript,
    onCloseScript,
    onSaveScript
}) {
    return (
        <div className="script-tabs">
            {openScripts.map(scriptName => (
                <div
                    key={scriptName}
                    className={`script-tab ${currentScriptName === scriptName ? 'active' : ''}`}
                    onClick={() => onSelectScript(scriptName)}
                >
                    <span className="tab-label">{scriptName}</span>
                    {dirtyScripts.includes(scriptName) && (
                        <div className="tab-dirty-indicator">
                            <Circle size={8} fill="currentColor" />
                        </div>
                    )}
                    <button
                        className="tab-close-btn"
                        onClick={(e) => {
                            e.stopPropagation()
                            onCloseScript(scriptName)
                        }}
                        title="Close tab"
                    >
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
    )
}
