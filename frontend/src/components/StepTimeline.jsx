/**
 * Step Timeline Component
 * 
 * Displays recorded automation steps with drag-drop reordering,
 * editing, and smart wait insertion.
 */

import { useState, useCallback } from 'react'
import { useDrag, useDrop } from 'react-dnd'
import { formatStepType } from '../utils/codeGenerator'
import './StepTimeline.css'
import {
    MousePointer2, Keyboard, Clock, Eye, Type,
    MoreVertical, Edit2, Trash2, Plus, GripVertical,
    FileText, List, Code2
} from 'lucide-react'

// Icon mapping helper
const getStepIcon = (type) => {
    switch (type) {
        case 'click':
        case 'double_click':
        case 'right_click':
            return <MousePointer2 size={16} />
        case 'type':
        case 'key_press':
        case 'key_combo':
            return <Keyboard size={16} />
        case 'wait':
        case 'wait_for_image':
        case 'wait_for_text':
            return <Clock size={16} />
        default:
            return <MousePointer2 size={16} />
    }
}

// Draggable Step Item
function StepItem({ step, index, onUpdate, onDelete, onMove }) {
    const [isEditing, setIsEditing] = useState(false)
    const [editValues, setEditValues] = useState({})

    const [{ isDragging }, drag] = useDrag({
        type: 'STEP',
        item: { index },
        collect: (monitor) => ({
            isDragging: monitor.isDragging()
        })
    })

    const [, drop] = useDrop({
        accept: 'STEP',
        hover: (draggedItem) => {
            if (draggedItem.index !== index) {
                onMove(draggedItem.index, index)
                draggedItem.index = index
            }
        }
    })

    const startEdit = () => {
        setEditValues({
            x: step.x,
            y: step.y,
            text: step.text,
            timeout: step.timeout,
            description: step.description
        })
        setIsEditing(true)
    }

    const saveEdit = () => {
        onUpdate(step.id, editValues)
        setIsEditing(false)
    }

    const cancelEdit = () => {
        setIsEditing(false)
    }

    return (
        <div
            ref={(node) => drag(drop(node))}
            className={`step-item ${isDragging ? 'dragging' : ''} ${isEditing ? 'editing' : ''}`}
        >
            <div className="step-handle"><GripVertical size={14} /></div>

            <div className="step-content">
                <div className="step-header">
                    <span className="step-icon">{getStepIcon(step.type)}</span>
                    <span className="step-type">{formatStepType(step.type)}</span>
                    <span className="step-order">#{step.order + 1}</span>
                </div>

                {isEditing ? (
                    <div className="step-edit-form">
                        {(step.type === 'click' || step.type === 'double_click' || step.type === 'right_click') && !step.template && (
                            <div className="edit-row">
                                <label>X:</label>
                                <input
                                    type="number"
                                    value={editValues.x || ''}
                                    onChange={(e) => setEditValues(v => ({ ...v, x: parseInt(e.target.value) }))}
                                />
                                <label>Y:</label>
                                <input
                                    type="number"
                                    value={editValues.y || ''}
                                    onChange={(e) => setEditValues(v => ({ ...v, y: parseInt(e.target.value) }))}
                                />
                            </div>
                        )}

                        {(step.type === 'type' || step.type === 'wait_for_text') && (
                            <div className="edit-row">
                                <label>Text:</label>
                                <input
                                    type="text"
                                    value={editValues.text || ''}
                                    onChange={(e) => setEditValues(v => ({ ...v, text: e.target.value }))}
                                />
                            </div>
                        )}

                        {(step.type === 'wait_for_image' || step.type === 'wait_for_text') && (
                            <div className="edit-row">
                                <label>Timeout:</label>
                                <input
                                    type="number"
                                    value={editValues.timeout || 30}
                                    onChange={(e) => setEditValues(v => ({ ...v, timeout: parseFloat(e.target.value) }))}
                                />
                                <span className="unit-label">seconds</span>
                            </div>
                        )}

                        <div className="edit-row">
                            <label>Note:</label>
                            <input
                                type="text"
                                value={editValues.description || ''}
                                onChange={(e) => setEditValues(v => ({ ...v, description: e.target.value }))}
                                placeholder="Add a description..."
                            />
                        </div>

                        <div className="edit-actions">
                            <button className="btn btn-sm btn-primary" onClick={saveEdit}>Save</button>
                            <button className="btn btn-sm btn-ghost" onClick={cancelEdit}>Cancel</button>
                        </div>
                    </div>
                ) : (
                    <div className="step-details">
                        {step.description && (
                            <p className="step-description">{step.description}</p>
                        )}

                        <div className="step-params">
                            {step.x !== undefined && step.y !== undefined && (
                                <span className="param">({step.x}, {step.y})</span>
                            )}
                            {step.template && (
                                <span className="param template"><Eye size={12} /> {step.template}</span>
                            )}
                            {step.text && (
                                <span className="param text">"{step.text}"</span>
                            )}
                            {step.keys && step.keys.length > 0 && (
                                <span className="param keys">[{step.keys.join(' + ')}]</span>
                            )}
                            {step.timeout && (
                                <span className="param timeout"><Clock size={12} /> {step.timeout}s</span>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="step-actions">
                <button
                    className="btn-icon-sm"
                    onClick={startEdit}
                    title="Edit"
                >
                    <Edit2 size={14} />
                </button>
                <button
                    className="btn-icon-sm delete"
                    onClick={() => onDelete(step.id)}
                    title="Delete"
                >
                    <Trash2 size={14} />
                </button>
            </div>
        </div>
    )
}

export default function StepTimeline({
    steps = [],
    onUpdateStep,
    onDeleteStep,
    onReorderSteps,
    onStartCoding,
    onAddStep,
    screenSize
}) {
    const [showSmartWaitMenu, setShowSmartWaitMenu] = useState(false)
    const [insertAtIndex, setInsertAtIndex] = useState(null)

    const sortedSteps = [...steps].sort((a, b) => a.order - b.order)

    const handleMove = useCallback((fromIndex, toIndex) => {
        onReorderSteps(fromIndex, toIndex)
    }, [onReorderSteps])

    return (
        <div className="step-timeline">
            <div className="timeline-header">
                <h3 className="panel-title"><List size={16} /> Steps</h3>
                <span className="step-count">{steps.length} steps</span>
            </div>

            <div className="timeline-content">
                {sortedSteps.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-state-icon"><FileText size={48} /></span>
                        <h3>No steps recorded</h3>
                        <p>Start recording to capture interactions</p>
                        {onStartCoding && (
                            <button
                                className="btn btn-sm btn-secondary mt-4"
                                onClick={onStartCoding}
                                style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                <Code2 size={16} /> Switch to Code Mode
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="steps-list">
                        {sortedSteps.map((step, index) => (
                            <StepItem
                                key={step.id}
                                step={step}
                                index={index}
                                onUpdate={onUpdateStep}
                                onDelete={onDeleteStep}
                                onMove={handleMove}
                            />
                        ))}
                    </div>
                )}
            </div>

            <div className="timeline-footer">
                <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => setShowSmartWaitMenu(true)}
                >
                    <Plus size={16} /> Add Smart Wait
                </button>
            </div>

            {/* Smart Wait Menu Modal */}
            {showSmartWaitMenu && (
                <div className="smart-wait-menu">
                    <div className="menu-header">
                        <span>Insert Smart Wait</span>
                        <button className="close-btn" onClick={() => setShowSmartWaitMenu(false)}>×</button>
                    </div>
                    <div className="menu-options">
                        <button onClick={() => {
                            if (onAddStep) onAddStep({ type: 'wait_for_image', template: 'template.png', timeout: 30, description: 'Wait for image' })
                            setShowSmartWaitMenu(false)
                        }}>
                            <Eye size={16} /> Wait for Image
                        </button>
                        <button onClick={() => {
                            if (onAddStep) onAddStep({ type: 'wait_for_text', text: 'Success', timeout: 30, description: 'Wait for text' })
                            setShowSmartWaitMenu(false)
                        }}>
                            <Type size={16} /> Wait for Text
                        </button>
                        <button onClick={() => {
                            if (onAddStep) onAddStep({ type: 'wait', timeout: 5, description: 'Wait 5s' })
                            setShowSmartWaitMenu(false)
                        }}>
                            <Clock size={16} /> Static Wait
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
