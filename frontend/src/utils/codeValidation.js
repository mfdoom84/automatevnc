/**
 * Code Validation Utilities
 * 
 * Validate and analyze code for errors and warnings.
 */

/**
 * Check if code is valid Python syntax (basic check).
 * 
 * @param {string} code - Python code to validate
 * @returns {object} { isValid, errors, warnings }
 */
export function validatePythonSyntax(code) {
    const errors = []
    const warnings = []

    if (!code || code.trim().length === 0) {
        errors.push('Code is empty')
        return { isValid: false, errors, warnings }
    }

    // Check for unclosed brackets
    const brackets = { '(': ')', '[': ']', '{': '}' }
    const stack = []
    
    for (let i = 0; i < code.length; i++) {
        const char = code[i]
        
        // Skip strings
        if (char === '"' || char === "'") {
            const quote = char
            i++
            while (i < code.length && code[i] !== quote) {
                if (code[i] === '\\') i++ // Skip escaped chars
                i++
            }
            continue
        }
        
        if (brackets[char]) {
            stack.push({ char, line: getLineNumber(code, i) })
        } else if (Object.values(brackets).includes(char)) {
            const opening = Object.keys(brackets).find(k => brackets[k] === char)
            if (stack.length > 0 && stack[stack.length - 1].char === opening) {
                stack.pop()
            } else {
                errors.push(`Unexpected closing bracket '${char}' on line ${getLineNumber(code, i)}`)
            }
        }
    }

    // Check for unclosed brackets
    if (stack.length > 0) {
        stack.forEach(({ char, line }) => {
            errors.push(`Unclosed bracket '${char}' on line ${line}`)
        })
    }

    // Check for common issues
    if (!code.includes('def run')) {
        warnings.push('Code should define a run() function')
    }

    if (code.includes('print(') && !code.includes('# ')) {
        warnings.push('Consider using comments instead of print() for debugging')
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    }
}

/**
 * Detect conflicts between generated and manual code.
 * 
 * @param {string} generatedCode - Auto-generated code
 * @param {string} manualCode - User code
 * @returns {object} { hasConflicts, conflicts }
 */
export function detectCodeConflicts(generatedCode, manualCode) {
    const conflicts = []

    if (!manualCode) return { hasConflicts: false, conflicts }

    const generatedLines = generatedCode.split('\n')
    const manualLines = manualCode.split('\n')

    // Check if manual code contains VNC client calls
    const vncPatterns = [
        /client\.click\(/,
        /client\.type\(/,
        /client\.press\(/,
        /client\.wait\(/,
        /vnc\.click\(/,
        /vnc\.type\(/,
        /vnc\.press\(/,
        /vnc\.wait\(/
    ]

    for (const pattern of vncPatterns) {
        if (pattern.test(manualCode)) {
            conflicts.push({
                type: 'mixed-api',
                message: 'Manual code uses VNC API - ensure consistency with generated code'
            })
            break
        }
    }

    // Check for duplicate imports
    const importLines = generatedLines.filter(l => l.trim().startsWith('import') || l.trim().startsWith('from'))
    const manualImportLines = manualLines.filter(l => l.trim().startsWith('import') || l.trim().startsWith('from'))

    for (const manualImport of manualImportLines) {
        if (importLines.some(imp => imp.includes(manualImport.split(' ')[1]))) {
            conflicts.push({
                type: 'duplicate-import',
                message: `Duplicate import detected: ${manualImport.trim()}`
            })
        }
    }

    // Check for function redefinition
    if (manualCode.includes('def run(')) {
        conflicts.push({
            type: 'redefine-function',
            message: 'Manual code redefines run() function - this will override generated code'
        })
    }

    return {
        hasConflicts: conflicts.length > 0,
        conflicts
    }
}

/**
 * Get line number at specific position in code.
 * 
 * @param {string} code - Code string
 * @param {number} position - Character position
 * @returns {number} Line number (1-indexed)
 */
function getLineNumber(code, position) {
    return code.substring(0, position).split('\n').length
}

/**
 * Format/indent Python code.
 * 
 * @param {string} code - Code to format
 * @returns {string} Formatted code
 */
export function formatPythonCode(code) {
    const lines = code.split('\n')
    const formatted = []
    let indentLevel = 0

    for (const line of lines) {
        const trimmed = line.trim()

        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) {
            formatted.push(line)
            continue
        }

        // Decrease indent for else, elif, except, finally
        if (trimmed.startsWith('else:') || trimmed.startsWith('elif ') || 
            trimmed.startsWith('except:') || trimmed.startsWith('finally:')) {
            indentLevel = Math.max(0, indentLevel - 1)
        }

        // Add indented line
        const indent = '    '.repeat(indentLevel)
        formatted.push(indent + trimmed)

        // Increase indent for lines ending with :
        if (trimmed.endsWith(':')) {
            indentLevel++
        }
    }

    return formatted.join('\n')
}

/**
 * Extract function definitions from code.
 * 
 * @param {string} code - Code to analyze
 * @returns {array} Array of function definitions
 */
export function extractFunctions(code) {
    const functions = []
    const lines = code.split('\n')

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        if (line.startsWith('def ')) {
            const match = line.match(/def\s+(\w+)\s*\((.*?)\)/)
            if (match) {
                functions.push({
                    name: match[1],
                    params: match[2].split(',').map(p => p.trim()),
                    lineNumber: i + 1
                })
            }
        }
    }

    return functions
}

/**
 * Extract imports from code.
 * 
 * @param {string} code - Code to analyze
 * @returns {array} Array of imports
 */
export function extractImports(code) {
    const imports = []
    const lines = code.split('\n')

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        
        if (line.startsWith('import ')) {
            imports.push({
                type: 'import',
                module: line.substring(7).trim(),
                lineNumber: i + 1,
                raw: line
            })
        } else if (line.startsWith('from ')) {
            const match = line.match(/from\s+([\w.]+)\s+import\s+(.+)/)
            if (match) {
                imports.push({
                    type: 'from',
                    module: match[1],
                    items: match[2].split(',').map(s => s.trim()),
                    lineNumber: i + 1,
                    raw: line
                })
            }
        }
    }

    return imports
}

export default {
    validatePythonSyntax,
    detectCodeConflicts,
    formatPythonCode,
    extractFunctions,
    extractImports
}
