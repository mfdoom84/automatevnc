/**
 * Code Generator
 * 
 * Converts visual automation steps to Python code.
 */

/**
 * Generate Python code from an array of steps.
 * Returns both the code and metadata.
 * 
 * @param {Array} steps - Array of step objects
 * @param {string} scriptName - Name of the script
 * @param {string} description - Script description
 * @returns {object} { code, lineCount, hash } - Generated code with metadata
 */
export function generateCodeWithMetadata(steps, scriptName = 'untitled', description = '') {
    const code = generateCode(steps, scriptName, description)
    const lineCount = code.split('\n').length

    // Simple hash for detecting changes
    let hash = 0
    for (let i = 0; i < code.length; i++) {
        const char = code.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash
    }

    return {
        code,
        lineCount,
        hash: Math.abs(hash).toString(16)
    }
}

/**
 * Generate Python code from an array of steps.
 * 
 * @param {Array} steps - Array of step objects
 * @param {string} scriptName - Name of the script
 * @param {string} description - Script description
 * @returns {string} Generated Python code
 */
export function generateCode(steps, scriptName = 'untitled', description = '') {
    const lines = [
        '"""',
        `AutoVNC Script: ${scriptName}`,
        `Generated: ${new Date().toISOString()}`,
        '',
        description || 'No description',
        '"""',
        '',
        'from autovnc import Keys',
        '',
        '',
        'def run(vnc):',
        '    """Execute the automation script."""'
    ];

    if (!steps || steps.length === 0) {
        lines.push('    pass');
    } else {
        const sortedSteps = [...steps].sort((a, b) => a.order - b.order);

        for (const step of sortedSteps) {
            // Add wait before action if recorded timing is significant
            if (step.delay_before !== undefined && step.delay_before !== null && step.delay_before > 0.1) {
                // Only add wait if > 0.1s (ignore micro-delays from recorder fluctuation)
                lines.push(`    vnc.wait(${step.delay_before})`);
            }

            const codeLine = stepToCode(step);
            if (codeLine) {
                // Add comment if description exists
                if (step.description) {
                    lines.push(`    # ${step.description}`);
                }
                lines.push(`    ${codeLine}`);
            }
        }
    }

    lines.push('');
    lines.push('if __name__ == "__main__":');
    lines.push('    from autovnc import VNCClient, ExecutionContext');
    lines.push('    import os');
    lines.push('');
    lines.push('    # Connection configuration');
    lines.push('    HOST = os.environ.get("VNC_HOST", "localhost")');
    lines.push('    PORT = int(os.environ.get("VNC_PORT", 5900))');
    lines.push('    PASSWORD = os.environ.get("VNC_PASSWORD", None)');
    lines.push('');
    lines.push('    client = VNCClient(HOST, PORT, password=PASSWORD)');
    lines.push('    try:');
    lines.push('        client.connect()');
    lines.push('        ctx = ExecutionContext(client)');
    lines.push('        ctx.wait(2) # Wait for connection to stabilize');
    lines.push('        run(ctx)');
    lines.push('    finally:');
    lines.push('        # Only disconnect if running in headless mode');
    lines.push('        if os.environ.get("AUTOVNC_HEADLESS", "false").lower() == "true":');
    lines.push('            client.disconnect()');

    return lines.join('\n');
}

/**
 * Convert a single step to Python code.
 * 
 * @param {Object} step - Step object
 * @returns {string|null} Python code line or null
 */
export function stepToCode(step) {
    switch (step.type) {
        case 'click':
            if (step.template) {
                const hintArg = (step.x !== undefined && step.y !== undefined && !isNaN(step.x) && !isNaN(step.y)) ? `, hint=(${Math.round(step.x)}, ${Math.round(step.y)})` : '';
                return `vnc.click("${step.template}", timeout=30.0${hintArg})`;
            }
            return `vnc.click(${step.x}, ${step.y})`;

        case 'double_click':
            if (step.template) {
                const hintArg = (step.x !== undefined && step.y !== undefined && !isNaN(step.x) && !isNaN(step.y)) ? `, hint=(${Math.round(step.x)}, ${Math.round(step.y)})` : '';
                return `vnc.double_click("${step.template}", timeout=30.0${hintArg})`;
            }
            return `vnc.double_click(${step.x}, ${step.y})`;

        case 'right_click':
            if (step.template) {
                const hintArg = (step.x !== undefined && step.y !== undefined && !isNaN(step.x) && !isNaN(step.y)) ? `, hint=(${Math.round(step.x)}, ${Math.round(step.y)})` : '';
                return `vnc.right_click("${step.template}", timeout=30.0${hintArg})`;
            }
            return `vnc.right_click(${step.x}, ${step.y})`;

        case 'type': {
            const text = (step.text || '').replace(/"/g, '\\"');
            let keysArg = '';
            if (step.keys && step.keys.length > 0) {
                const keysList = step.keys.map(k => `Keys.${k.toUpperCase()}`).join(', ');
                keysArg = `, [${keysList}]`;
            }
            return `vnc.type("${text}"${keysArg})`;
        }

        case 'key_press':
            if (step.keys && step.keys.length > 0) {
                const keys = step.keys.map(k => `Keys.${k.toUpperCase()}`).join(', ');
                return `vnc.press(${keys})`;
            }
            return null;

        case 'key_combo':
            if (step.keys && step.keys.length > 0) {
                const keys = step.keys.map(k => `Keys.${k.toUpperCase()}`).join(', ');
                return `vnc.key_combo(${keys})`;
            }
            return null;

        case 'wait_for_image': {
            let regionArg = '';
            let hintArg = '';
            if (step.region) {
                regionArg = `, region=(${step.region.x}, ${step.region.y}, ${step.region.width}, ${step.region.height})`;
                const hintX = Math.round(step.region.x + step.region.width / 2);
                const hintY = Math.round(step.region.y + step.region.height / 2);
                if (!isNaN(hintX) && !isNaN(hintY)) {
                    hintArg = `, hint=(${hintX}, ${hintY})`;
                }
            } else if (step.x !== undefined && step.y !== undefined && !isNaN(step.x) && !isNaN(step.y)) {
                hintArg = `, hint=(${Math.round(step.x)}, ${Math.round(step.y)})`;
            }
            return `vnc.wait_for_image("${step.template}", timeout=${step.timeout || 30}${regionArg}${hintArg})`;
        }

        case 'wait_for_text': {
            const text = (step.text || '').replace(/"/g, '\\"');
            let regionArg = '';
            if (step.region) {
                regionArg = `, region=(${step.region.x}, ${step.region.y}, ${step.region.width}, ${step.region.height})`;
            }
            const caseArg = step.case_sensitive ? ', case_sensitive=true' : '';
            return `vnc.wait_for_text("${text}", timeout=${step.timeout || 30}${regionArg}${caseArg})`;
        }

        case 'wait':
            return `vnc.wait(${step.duration || 1.0})`;

        case 'screenshot':
            return 'vnc.save_screenshot("screenshot.png")';

        case 'drag':
            return `vnc.drag(${step.x}, ${step.y}, ${step.end_x}, ${step.end_y})`;

        default:
            return null;
    }
}

/**
 * Format step type for display.
 * 
 * @param {string} type - Step type
 * @returns {string} Formatted type name
 */
export function formatStepType(type) {
    const typeMap = {
        'click': 'Click',
        'double_click': 'Double Click',
        'right_click': 'Right Click',
        'type': 'Type',
        'key_press': 'Key Press',
        'key_combo': 'Key Combo',
        'wait_for_image': 'Wait for Image',
        'wait_for_text': 'Wait for Text',
        'wait': 'Wait',
        'screenshot': 'Screenshot',
        'drag': 'Drag'
    };

    return typeMap[type] || type;
}

/**
 * Get icon for step type.
 * 
 * @param {string} type - Step type
 * @returns {string} Icon character
 */
export function getStepIcon(type) {
    const iconMap = {
        'click': '🖱️',
        'double_click': '🖱️',
        'right_click': '🖱️',
        'type': '⌨️',
        'key_press': '⌨️',
        'key_combo': '⌨️',
        'wait_for_image': '👁️',
        'wait_for_text': '📝',
        'wait': '⏱️',
        'screenshot': '📷',
        'drag': '↔️'
    };

    return iconMap[type] || '•';
}

export default {
    generateCode,
    generateCodeWithMetadata,
    stepToCode,
    formatStepType,
    getStepIcon
};
