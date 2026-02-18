/**
 * Step Utilities
 * 
 * Helper functions for working with steps.
 */

import { v4 as uuidv4 } from 'uuid'

/**
 * Create a new blank step of the given type.
 * 
 * @param {string} type - Step type
 * @returns {object} New step object
 */
export function createBlankStep(type = 'click') {
    return {
        id: uuidv4().substring(0, 8),
        type,
        order: 0,
        // Coordinates
        x: 0,
        y: 0,
        end_x: 0,
        end_y: 0,
        // Text input
        text: '',
        keys: [],
        // Template matching
        template: '',
        threshold: 0.8,
        // Wait parameters
        timeout: 30,
        duration: 1,
        region: null,
        case_sensitive: false,
        // Recording timing
        delay_before: null,
        // Description
        description: ''
    }
}

/**
 * Validate a step has required fields for its type.
 * 
 * @param {object} step - Step to validate
 * @returns {object} { isValid, errors }
 */
export function validateStep(step) {
    const errors = []

    if (!step.type) {
        errors.push('Step type is required')
    }

    switch (step.type) {
        case 'click':
        case 'double_click':
        case 'right_click':
            if (!step.template && (step.x === undefined || step.y === undefined)) {
                errors.push('Either template or X,Y coordinates required')
            }
            break

        case 'type':
            if (!step.text && (!step.keys || step.keys.length === 0)) {
                errors.push('Either text or keys required')
            }
            break

        case 'key_press':
        case 'key_combo':
            if (!step.keys || step.keys.length === 0) {
                errors.push('Keys required')
            }
            break

        case 'wait_for_image':
            if (!step.template) {
                errors.push('Template image required')
            }
            break

        case 'wait_for_text':
            if (!step.text) {
                errors.push('Text to wait for is required')
            }
            break
    }

    return {
        isValid: errors.length === 0,
        errors
    }
}

/**
 * Get default values for a step type.
 * 
 * @param {string} type - Step type
 * @returns {object} Default values
 */
export function getStepDefaults(type) {
    const defaults = {
        x: 0,
        y: 0,
        end_x: 0,
        end_y: 0,
        text: '',
        keys: [],
        template: '',
        threshold: 0.8,
        timeout: 30,
        duration: 1,
        region: null,
        description: ''
    }

    switch (type) {
        case 'wait':
            return { ...defaults, duration: 1 }
        case 'wait_for_image':
        case 'wait_for_text':
            return { ...defaults, timeout: 30 }
        default:
            return defaults
    }
}

/**
 * Clone a step.
 * 
 * @param {object} step - Step to clone
 * @returns {object} Cloned step with new ID
 */
export function cloneStep(step) {
    return {
        ...step,
        id: uuidv4().substring(0, 8)
    }
}

/**
 * Create a step from recorded VNC data.
 * 
 * @param {object} vnc - VNC interaction data
 * @returns {object} Step object
 */
export function createStepFromVNC(vnc) {
    const step = createBlankStep(vnc.type)

    switch (vnc.type) {
        case 'click':
        case 'double_click':
        case 'right_click':
            step.x = vnc.x
            step.y = vnc.y
            break

        case 'type':
            step.text = vnc.text || ''
            step.keys = vnc.keys || []
            break

        case 'key_press':
        case 'key_combo':
            step.keys = vnc.keys || []
            break

        case 'wait':
            step.duration = vnc.duration || vnc.timeout || 1
            break

        case 'drag':
            step.x = vnc.x
            step.y = vnc.y
            step.end_x = vnc.end_x
            step.end_y = vnc.end_y
            break
    }

    if (vnc.description) {
        step.description = vnc.description
    }

    // Copy timing information if present
    if (vnc.delay_before !== undefined && vnc.delay_before !== null) {
        step.delay_before = vnc.delay_before
    }

    return step
}

export default {
    createBlankStep,
    validateStep,
    getStepDefaults,
    cloneStep,
    createStepFromVNC
}
