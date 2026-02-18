/**
 * Code Validation Panel Component
 * 
 * Shows validation errors, warnings, and detected conflicts.
 */

import React, { useState, useEffect } from 'react'
import './CodeValidationPanel.css'
import { AlertCircle, CheckCircle, AlertTriangle, ChevronDown } from 'lucide-react'
import { validatePythonSyntax, detectCodeConflicts } from '../utils/codeValidation'

const CodeValidationPanel = ({
    generatedCode = '',
    manualCode = '',
    isVisible = false,
    onClose = () => { },
}) => {
    const [validation, setValidation] = useState({ isValid: true, errors: [], warnings: [] })
    const [conflicts, setConflicts] = useState({ hasConflicts: false, conflicts: [] })
    const [expanded, setExpanded] = useState(true)

    // Validate code whenever it changes
    useEffect(() => {
        const fullCode = generatedCode + '\n' + manualCode
        const result = validatePythonSyntax(fullCode)
        setValidation(result)
    }, [generatedCode, manualCode])

    // Detect conflicts
    useEffect(() => {
        const result = detectCodeConflicts(generatedCode, manualCode)
        setConflicts(result)
    }, [generatedCode, manualCode])

    if (!isVisible) return null

    const hasIssues = !validation.isValid || validation.warnings.length > 0 || conflicts.hasConflicts
    const severity = !validation.isValid ? 'error' : conflicts.hasConflicts ? 'warning' : 'info'

    return (
        <div className={`code-validation-panel ${severity}`}>
            <div className="cvp-header" onClick={() => setExpanded(!expanded)}>
                <div className="cvp-title">
                    {!validation.isValid && <AlertCircle size={16} className="cvp-icon error" />}
                    {validation.isValid && !conflicts.hasConflicts && <CheckCircle size={16} className="cvp-icon success" />}
                    {validation.isValid && conflicts.hasConflicts && <AlertTriangle size={16} className="cvp-icon warning" />}
                    
                    <span className="cvp-text">
                        {!validation.isValid ? (
                            <>Code has {validation.errors.length} error{validation.errors.length !== 1 ? 's' : ''}</>
                        ) : conflicts.hasConflicts ? (
                            <>Code has {conflicts.conflicts.length} potential issue{conflicts.conflicts.length !== 1 ? 's' : ''}</>
                        ) : (
                            <>Code looks good</>
                        )}
                    </span>
                </div>
                <ChevronDown size={16} className={`cvp-chevron ${expanded ? 'expanded' : ''}`} />
            </div>

            {expanded && (
                <div className="cvp-content">
                    {/* Errors */}
                    {validation.errors.length > 0 && (
                        <div className="cvp-section">
                            <h4 className="cvp-section-title error">Errors</h4>
                            {validation.errors.map((error, idx) => (
                                <div key={idx} className="cvp-item error">
                                    <span className="cvp-item-icon">⚠</span>
                                    <span className="cvp-item-text">{error}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Conflicts */}
                    {conflicts.conflicts.length > 0 && (
                        <div className="cvp-section">
                            <h4 className="cvp-section-title warning">Potential Issues</h4>
                            {conflicts.conflicts.map((conflict, idx) => (
                                <div key={idx} className="cvp-item warning">
                                    <span className="cvp-item-icon">⚠</span>
                                    <div className="cvp-item-content">
                                        <span className="cvp-item-type">{conflict.type}</span>
                                        <span className="cvp-item-text">{conflict.message}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Warnings */}
                    {validation.warnings.length > 0 && (
                        <div className="cvp-section">
                            <h4 className="cvp-section-title info">Suggestions</h4>
                            {validation.warnings.map((warning, idx) => (
                                <div key={idx} className="cvp-item info">
                                    <span className="cvp-item-icon">ℹ</span>
                                    <span className="cvp-item-text">{warning}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Success */}
                    {!validation.errors.length && !conflicts.conflicts.length && !validation.warnings.length && (
                        <div className="cvp-section">
                            <div className="cvp-item success">
                                <span className="cvp-item-icon">✓</span>
                                <span className="cvp-item-text">Code syntax looks valid</span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default CodeValidationPanel
