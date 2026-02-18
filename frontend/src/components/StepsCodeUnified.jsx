/**
 * Steps ↔ Code Unified Editor
 * 
 * Single component that provides both steps view and code view
 * of the same script, with proper separation of generated vs manual code.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import './StepsCodeUnified.css'
import { ChevronDown, Plus, Trash2, Eye, Code } from 'lucide-react'
import StepListItem from './StepListItem'
import StepDetailEditor from './StepDetailEditor'
import CodeViewWithMarkers from './CodeViewWithMarkers'
import CodeValidationPanel from './CodeValidationPanel'

const StepsCodeUnified = React.forwardRef(({
    currentScript,
    steps = [],
    generatedCode = '',
    manualCode = '',
    generatedLineCount = 0,
    code = '',
    isCodeMode = false,
    isRecording = false,
    onStepsChange = () => { },
    onCodeChange = () => { },
    onManualCodeChange = () => { },
    onUpdateStep = () => { },
    onDeleteStep = () => { },
    onReorderSteps = () => { },
    onAddStep = () => { },
    onToggleRecording = () => { },
    onChangeMode = () => { },
    editorRef = null,
}, ref) => {
    const [viewMode, setViewMode] = useState('steps') // 'steps' | 'code'
    const [selectedStepId, setSelectedStepId] = useState(null)
    const [showValidation, setShowValidation] = useState(false)

    // When switching view mode
    const handleViewModeChange = useCallback((newMode) => {
        setViewMode(newMode)
    }, [])

    // Handle step selection
    const handleSelectStep = useCallback((stepId) => {
        setSelectedStepId(stepId)
    }, [])

    // Handle step add
    const handleAddStep = useCallback(() => {
        // Create a new blank step form at bottom
        // User can fill it in the detail panel
        onAddStep()
    }, [onAddStep])

    if (!currentScript) {
        return (
            <div className="scu-empty">
                <p>No script selected</p>
            </div>
        )
    }

    if (!currentScript) {
        return (
            <div className="scu-empty">
                <p>No script selected</p>
            </div>
        )
    }

    return (
        <div className="steps-code-unified">
            {/* Header with controls */}
            <div className="scu-header">
                <div className="scu-title">
                    <h2>{currentScript.metadata?.name}</h2>
                    <span className="scu-description">
                        {currentScript.metadata?.description || 'No description'}
                    </span>
                </div>

                <div className="scu-controls">
                    <div className="scu-view-toggle">
                        <button
                            className={`scu-toggle-btn ${viewMode === 'steps' ? 'active' : ''}`}
                            onClick={() => handleViewModeChange('steps')}
                            title="View Steps"
                        >
                            <Eye size={16} />
                            Steps
                        </button>
                        <button
                            className={`scu-toggle-btn ${viewMode === 'code' ? 'active' : ''}`}
                            onClick={() => handleViewModeChange('code')}
                            title="View Code"
                        >
                            <Code size={16} />
                            Code
                        </button>
                    </div>

                    {viewMode === 'code' && (
                        <button
                            className={`scu-validate-btn ${showValidation ? 'active' : ''}`}
                            onClick={() => setShowValidation(!showValidation)}
                            title="Toggle validation panel"
                        >
                            ✓ Validate
                        </button>
                    )}

                    <button
                        className={`scu-record-btn ${isRecording ? 'recording' : ''}`}
                        onClick={onToggleRecording}
                        title="Toggle Recording"
                    >
                        <span className="record-indicator"></span>
                        {isRecording ? 'Recording' : 'Record'}
                    </button>
                </div>
            </div>

            {/* Content Area - Steps or Code View */}
            <div className="scu-content">
                {viewMode === 'steps' ? (
                    // STEPS VIEW
                    <div className="scu-steps-view">
                        <div className="scu-steps-list">
                            <div className="scu-list-header">
                                <h3>Steps ({steps.length})</h3>
                                <button
                                    className="btn-add-step"
                                    onClick={handleAddStep}
                                    title="Add new step"
                                >
                                    <Plus size={16} />
                                    Add
                                </button>
                            </div>

                            <div className="scu-steps-scroll">
                                {steps.length === 0 ? (
                                    <div className="scu-empty-steps">
                                        <p>No steps yet</p>
                                        <p className="hint">Record steps from VNC or add them manually</p>
                                    </div>
                                ) : (
                                    <div className="scu-steps-items">
                                        {steps.map((step, index) => (
                                            <StepListItem
                                                key={step.id}
                                                step={step}
                                                stepNumber={index + 1}
                                                isSelected={selectedStepId === step.id}
                                                onSelect={() => handleSelectStep(step.id)}
                                                onDelete={() => onDeleteStep(step.id)}
                                                onDragStart={(e) => {
                                                    e.dataTransfer.effectAllowed = 'move'
                                                    e.dataTransfer.setData('stepIndex', index)
                                                }}
                                                onDragOver={(e) => {
                                                    e.preventDefault()
                                                    e.dataTransfer.dropEffect = 'move'
                                                }}
                                                onDrop={(e) => {
                                                    e.preventDefault()
                                                    const fromIndex = parseInt(e.dataTransfer.getData('stepIndex'))
                                                    if (fromIndex !== index) {
                                                        onReorderSteps(fromIndex, index)
                                                    }
                                                }}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="scu-step-detail">
                            {selectedStepId ? (
                                <StepDetailEditor
                                    step={steps.find(s => s.id === selectedStepId)}
                                    onUpdate={(updates) => onUpdateStep(selectedStepId, updates)}
                                    onDelete={() => onDeleteStep(selectedStepId)}
                                />
                            ) : (
                                <div className="scu-no-selection">
                                    <p>Select a step to edit details</p>
                                    <p className="hint">Or record new steps from VNC</p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    // CODE VIEW
                    <div className="scu-code-view">
                        <CodeViewWithMarkers
                            ref={editorRef}
                            generatedCode={generatedCode}
                            manualCode={manualCode}
                            onManualCodeChange={onManualCodeChange}
                            steps={steps}
                            isRecording={isRecording}
                            generatedLineCount={generatedLineCount}
                        />
                    </div>
                )}
            </div>

            {/* Validation Panel */}
            <CodeValidationPanel
                generatedCode={generatedCode}
                manualCode={manualCode}
                isVisible={showValidation && viewMode === 'code'}
                onClose={() => setShowValidation(false)}
            />
        </div>
    )
})

StepsCodeUnified.displayName = 'StepsCodeUnified'
export default StepsCodeUnified
