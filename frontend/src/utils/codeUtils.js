/**
 * Code Utilities
 * 
 * Utilities for handling generated vs manual code separation.
 */

/**
 * Separate generated code from manual code.
 * 
 * @param {string} fullCode - Complete code string
 * @param {number} generatedLineCount - Number of lines that are auto-generated
 * @returns {object} { generated, manual } - Both portions
 */
export function separateGeneratedFromManual(fullCode, generatedLineCount) {
    if (!fullCode) {
        return { generated: '', manual: '' }
    }

    const lines = fullCode.split('\n')
    
    // Handle cases where generatedLineCount is 0 or undefined
    if (!generatedLineCount || generatedLineCount <= 0) {
        return { generated: '', manual: fullCode }
    }

    // Split at the specified line count
    const generatedLines = lines.slice(0, generatedLineCount)
    const manualLines = lines.slice(generatedLineCount)

    return {
        generated: generatedLines.join('\n'),
        manual: manualLines.join('\n')
    }
}

/**
 * Concatenate generated and manual code sections.
 * 
 * @param {string} generated - Auto-generated code
 * @param {string} manual - User-written code
 * @returns {string} Combined code
 */
export function concatenateCodes(generated, manual) {
    if (!generated && !manual) {
        return ''
    }

    // If no generated code, just return manual
    if (!generated) {
        return manual || ''
    }

    // If no manual code, just return generated
    if (!manual) {
        return generated
    }

    // Concatenate with single newline separator
    return generated + '\n' + manual
}

/**
 * Count non-empty lines in code string.
 * Useful for determining where generated code ends.
 * 
 * @param {string} code - Code string
 * @returns {number} Number of lines
 */
export function countLines(code) {
    if (!code) return 0
    return code.split('\n').length
}

/**
 * Generate a hash of the generated code.
 * Used to detect if user has edited the generated section.
 * 
 * @param {string} code - Code to hash
 * @returns {string} Simple hash
 */
export function hashCode(code) {
    if (!code) return '0'
    
    let hash = 0
    for (let i = 0; i < code.length; i++) {
        const char = code.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(16)
}

/**
 * Detect if manual code has been added (heuristic).
 * 
 * @param {string} generatedCode - Expected generated code
 * @param {string} fullCode - Actual full code
 * @returns {boolean} True if manual code likely exists
 */
export function hasManualCode(generatedCode, fullCode) {
    if (!generatedCode || !fullCode) {
        return false
    }

    // If full code is significantly longer, likely has manual code
    return fullCode.length > generatedCode.length * 1.2
}

/**
 * Extract manual code by removing known generated portion.
 * This is a fallback for old scripts without codeMetadata.
 * 
 * @param {string} generatedCode - What we expect as generated
 * @param {string} fullCode - The actual full code
 * @returns {string} Likely manual code portion
 */
export function extractManualCodeFallback(generatedCode, fullCode) {
    if (!generatedCode || !fullCode) {
        return ''
    }

    // Try to find where generated code ends
    const generatedLines = generatedCode.split('\n')
    const fullLines = fullCode.split('\n')

    // Look for where generated code stops matching
    let matchIndex = 0
    for (let i = 0; i < generatedLines.length && i < fullLines.length; i++) {
        if (generatedLines[i].trim() === fullLines[i].trim()) {
            matchIndex = i + 1
        } else {
            break
        }
    }

    // Return everything after the matched portion
    const manualLines = fullLines.slice(matchIndex)
    return manualLines.join('\n').trim()
}

/**
 * Compare generated code to detect user modifications.
 * 
 * @param {string} oldGenerated - Previously generated code
 * @param {string} newGenerated - Newly generated code
 * @returns {boolean} True if significantly different
 */
export function generatedCodeChanged(oldGenerated, newGenerated) {
    if (!oldGenerated && !newGenerated) {
        return false
    }

    return oldGenerated !== newGenerated
}

/**
 * Get the line number where manual code starts.
 * 
 * @param {number} generatedLineCount - Number of generated lines
 * @returns {number} Line number where manual code begins (1-indexed)
 */
export function getManualCodeStartLine(generatedLineCount) {
    return (generatedLineCount || 0) + 1
}

/**
 * Merge generated and manual code intelligently.
 * Handles cases where user may have edited generated section.
 * 
 * @param {string} newGenerated - Freshly generated code
 * @param {string} oldGenerated - Previously generated code
 * @param {string} fullCode - User's full code (might have edits)
 * @returns {object} { merged, hasConflict }
 */
export function mergeGeneratedAndManual(newGenerated, oldGenerated, fullCode) {
    const oldLines = (oldGenerated || '').split('\n').length

    // If user hasn't modified generated section, just replace it
    if (fullCode.startsWith(oldGenerated)) {
        const manual = fullCode.slice(oldGenerated.length)
        return {
            merged: newGenerated + manual,
            hasConflict: false
        }
    }

    // Otherwise, there might be edits in the generated section
    // Try to extract manual code and use new generated
    const manual = extractManualCodeFallback(oldGenerated, fullCode)
    return {
        merged: newGenerated + '\n' + manual,
        hasConflict: true
    }
}
