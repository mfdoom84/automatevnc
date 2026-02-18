/**
 * Step Detail Editor Component
 * 
 * Form to edit detailed properties of a selected step.
 */

import React, { useState, useEffect } from 'react'
import './StepDetailEditor.css'
import { Save, X } from 'lucide-react'
import { validateStep } from '../utils/stepUtils'

const StepDetailEditor = ({
    step = null,
    onUpdate = () => { },
    onDelete = () => { },
}) => {
    const [formData, setFormData] = useState({})
    const [errors, setErrors] = useState([])
    const [isDirty, setIsDirty] = useState(false)

    // Update form when step changes
    useEffect(() => {
        if (step) {
            setFormData({ ...step })
            setErrors([])
            setIsDirty(false)
        }
    }, [step])

    if (!step) {
        return (
            <div className="step-detail-empty">
                <p>No step selected</p>
            </div>
        )
    }

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }))
        setIsDirty(true)
        // Clear validation errors when user starts editing
        setErrors([])
    }

    const handleSave = () => {
        // Validate before saving
        const validation = validateStep(formData)
        if (!validation.isValid) {
            setErrors(validation.errors)
            return
        }

        onUpdate(formData)
        setIsDirty(false)
    }

    const handleCancel = () => {
        // Revert to original step
        if (step) {
            setFormData({ ...step })
            setErrors([])
            setIsDirty(false)
        }
    }

    const handleDelete = () => {
        if (confirm('Delete this step?')) {
            onDelete()
        }
    }

    return (
        <div className="step-detail-editor">
            <div className="sde-header">
                <h3>Step Details</h3>
            </div>

            <div className="sde-content">
                {errors.length > 0 && (
                    <div className="sde-errors">
                        {errors.map((error, idx) => (
                            <div key={idx} className="sde-error-item">
                                ⚠ {error}
                            </div>
                        ))}
                    </div>
                )}

                <div className="sde-form-group">
                    <label>Type</label>
                    <input
                        type="text"
                        value={formData.type || ''}
                        disabled
                        className="sde-input"
                    />
                </div>

                {/* Coordinates for click/drag steps */}
                {['click', 'double_click', 'right_click', 'drag'].includes(step.type) && (
                    <>
                        <div className="sde-row">
                            <div className="sde-form-group">
                                <label>X</label>
                                <input
                                    type="number"
                                    value={formData.x || 0}
                                    onChange={(e) => handleInputChange('x', parseInt(e.target.value))}
                                    className="sde-input"
                                />
                            </div>
                            <div className="sde-form-group">
                                <label>Y</label>
                                <input
                                    type="number"
                                    value={formData.y || 0}
                                    onChange={(e) => handleInputChange('y', parseInt(e.target.value))}
                                    className="sde-input"
                                />
                            </div>
                        </div>

                        {step.type === 'drag' && (
                            <div className="sde-row">
                                <div className="sde-form-group">
                                    <label>End X</label>
                                    <input
                                        type="number"
                                        value={formData.end_x || 0}
                                        onChange={(e) => handleInputChange('end_x', parseInt(e.target.value))}
                                        className="sde-input"
                                    />
                                </div>
                                <div className="sde-form-group">
                                    <label>End Y</label>
                                    <input
                                        type="number"
                                        value={formData.end_y || 0}
                                        onChange={(e) => handleInputChange('end_y', parseInt(e.target.value))}
                                        className="sde-input"
                                    />
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* Text input for type steps */}
                {step.type === 'type' && (
                    <div className="sde-form-group">
                        <label>Text</label>
                        <textarea
                            value={formData.text || ''}
                            onChange={(e) => handleInputChange('text', e.target.value)}
                            className="sde-textarea"
                            rows="3"
                        />
                    </div>
                )}

                {/* Keys for key_press/key_combo */}
                {['key_press', 'key_combo'].includes(step.type) && (
                    <div className="sde-form-group">
                        <label>Keys (comma-separated)</label>
                        <input
                            type="text"
                            value={(formData.keys || []).join(', ')}
                            onChange={(e) => handleInputChange('keys', e.target.value.split(',').map(k => k.trim()))}
                            className="sde-input"
                            placeholder="e.g., ctrl, a"
                        />
                    </div>
                )}

                {/* Template for image/text matching */}
                {['click', 'double_click', 'right_click', 'wait_for_image'].includes(step.type) && (
                    <div className="sde-form-group">
                        <label>Template (optional)</label>
                        <input
                            type="text"
                            value={formData.template || ''}
                            onChange={(e) => handleInputChange('template', e.target.value)}
                            className="sde-input"
                            placeholder="template.png"
                        />
                    </div>
                )}

                {/* Text for wait_for_text */}
                {step.type === 'wait_for_text' && (
                    <div className="sde-form-group">
                        <label>Wait for Text</label>
                        <input
                            type="text"
                            value={formData.text || ''}
                            onChange={(e) => handleInputChange('text', e.target.value)}
                            className="sde-input"
                        />
                    </div>
                )}

                {/* Timeout/Duration */}
                {['wait', 'wait_for_image', 'wait_for_text'].includes(step.type) && (
                    <div className="sde-form-group">
                        <label>{step.type === 'wait' ? 'Duration (seconds)' : 'Timeout (seconds)'}</label>
                        <input
                            type="number"
                            step="0.1"
                            value={formData[step.type === 'wait' ? 'duration' : 'timeout'] || 1}
                            onChange={(e) => handleInputChange(step.type === 'wait' ? 'duration' : 'timeout', parseFloat(e.target.value))}
                            className="sde-input"
                        />
                    </div>
                )}

                {/* Description/Comment */}
                <div className="sde-form-group">
                    <label>Comment/Description (optional)</label>
                    <textarea
                        value={formData.description || ''}
                        onChange={(e) => handleInputChange('description', e.target.value)}
                        className="sde-textarea"
                        rows="2"
                        placeholder="Add a comment to explain this step..."
                    />
                </div>
            </div>

            <div className="sde-footer">
                <button
                    className="btn btn-danger"
                    onClick={handleDelete}
                >
                    <X size={16} />
                    Delete
                </button>
                <div className="sde-footer-actions">
                    {isDirty && (
                        <button
                            className="btn btn-secondary"
                            onClick={handleCancel}
                        >
                            Cancel
                        </button>
                    )}
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={!isDirty}
                    >
                        <Save size={16} />
                        {isDirty ? 'Update' : 'Saved'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default StepDetailEditor
