/**
 * Step List Item Component
 * 
 * Individual step in the step list with icons, description, and actions.
 */

import React from 'react'
import './StepListItem.css'
import { Trash2, GripVertical } from 'lucide-react'
import { getStepIcon, formatStepType } from '../utils/codeGenerator'

const StepListItem = ({
    step,
    stepNumber = 1,
    isSelected = false,
    onSelect = () => { },
    onDelete = () => { },
    onDragStart = () => { },
    onDragOver = () => { },
    onDrop = () => { },
}) => {
    // Generate a readable description of the step
    const getStepDescription = () => {
        const type = step.type || 'unknown'

        switch (type) {
            case 'click':
            case 'double_click':
            case 'right_click':
                if (step.template) {
                    return `${formatStepType(type)} "${step.template}"`
                }
                return `${formatStepType(type)} at (${step.x}, ${step.y})`

            case 'type':
                return `Type: "${step.text?.substring(0, 30) || 'text'}${step.text?.length > 30 ? '...' : ''}"`

            case 'key_press':
            case 'key_combo':
                return `${formatStepType(type)}: ${step.keys?.join(' + ') || 'key'}`

            case 'wait':
                return `Wait ${step.duration || 1}s`

            case 'wait_for_image':
                return `Wait for image: "${step.template || 'template.png'}"`

            case 'wait_for_text':
                return `Wait for text: "${step.text || 'text'}"`

            case 'screenshot':
                return `Take screenshot`

            case 'drag':
                return `Drag from (${step.x}, ${step.y}) to (${step.end_x}, ${step.end_y})`

            default:
                return formatStepType(type)
        }
    }

    return (
        <div
            className={`step-list-item ${isSelected ? 'selected' : ''}`}
            onClick={onSelect}
            draggable
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
        >
            <div className="step-item-handle">
                <GripVertical size={14} className="grip-icon" />
            </div>

            <div className="step-item-number">
                {stepNumber}
            </div>

            <div className="step-item-icon">
                {getStepIcon(step.type)}
            </div>

            <div className="step-item-content">
                <div className="step-item-type">
                    {formatStepType(step.type)}
                </div>
                <div className="step-item-description">
                    {getStepDescription()}
                </div>
                {step.description && (
                    <div className="step-item-comment">
                        {step.description}
                    </div>
                )}
            </div>

            <div className="step-item-actions">
                <button
                    className="btn-delete-step"
                    onClick={(e) => {
                        e.stopPropagation()
                        onDelete()
                    }}
                    title="Delete step"
                >
                    <Trash2 size={14} />
                </button>
            </div>
        </div>
    )
}

export default StepListItem
