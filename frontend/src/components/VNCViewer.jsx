/**
 * VNC Viewer Component
 * 
 * Integrates noVNC for VNC display and captures user interactions
 * for automation recording.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import RFB from '@novnc/novnc/lib/rfb'
import { scaleCoordinates } from '../utils/coordinates'
import { vncApi } from '../services/api'
import './VNCViewer.css'
import {
    AlertTriangle, Power, Monitor,
    Aperture, Play, Square, Settings,
    Shield, Type, X, Check
} from 'lucide-react'

export default function VNCViewer({
    host,
    port = 5900,
    password,
    onDisconnect,
    onScreenSize,
    onStep,
    onInteraction,
    isRecording,
    isPaused = false,
    onToggleRecording,
    onPauseRecording,
    isRunning = false,
    onStopRun
}) {
    console.log('[VNC] Rendered. isRecording:', isRecording)
    const containerRef = useRef(null)
    const canavsWrapperRef = useRef(null)
    const rfbRef = useRef(null)

    const [status, setStatus] = useState('connecting')
    const [error, setError] = useState(null)
    const [screenWidth, setScreenWidth] = useState(1024)
    const [screenHeight, setScreenHeight] = useState(768)

    // Recording Modes
    const [isSmartRecord, setIsSmartRecord] = useState(true)
    const [isCoordinates, setIsCoordinates] = useState(false)

    // Recording timing: track when recording started and when last action was
    const recordingStartTimeRef = useRef(null)
    const lastActionTimeRef = useRef(null)

    // Verify Mode (Assertions)
    const [isVerifyMode, setIsVerifyMode] = useState(false)
    const [isVerifyTextMode, setIsVerifyTextMode] = useState(false)
    const [isSelecting, setIsSelecting] = useState(false)
    const [selectionStart, setSelectionStart] = useState(null)
    const [selectionRect, setSelectionRect] = useState(null)

    // OCR Modal State
    const [ocrModal, setOcrModal] = useState({
        isOpen: false,
        detectedText: '',
        isLoading: false,
        region: null
    })

    // OCR pending image data (for useEffect processing)
    const [ocrPendingImage, setOcrPendingImage] = useState(null)

    // Pending text verification (to show selection while modal opens)
    const [textVerifyPending, setTextVerifyPending] = useState(false)

    // Connect to VNC via noVNC
    useEffect(() => {
        if (!host || !canavsWrapperRef.current) return

        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsUrl = `${wsProtocol}//${window.location.host}/api/vnc/proxy?host=${encodeURIComponent(host)}&port=${port}`

        setStatus('connecting')
        setError(null)

        try {
            // Create RFB instance
            const rfb = new RFB(canavsWrapperRef.current, wsUrl, {
                credentials: { password: password },
                clipViewport: false,
                dragViewport: false,
                scaleViewport: false
            })

            rfbRef.current = rfb

            // Event handlers
            rfb.addEventListener('connect', () => {
                setStatus('connected')
                rfb.focus()
            })

            rfb.addEventListener('disconnect', (e) => {
                setStatus('disconnected')
                if (e.detail?.clean) {
                    // Clean disconnect
                } else {
                    // unexpected disconnect
                    setError(e.detail?.reason || 'Disconnected from server')
                    setStatus('error')
                }
            })

            rfb.addEventListener('credentialsrequired', () => {
                rfb.sendCredentials({ password: password })
            })

            rfb.addEventListener('desktopname', (e) => {
                console.log('Desktop name:', e.detail.name)
            })

            rfb.addEventListener('securityfailure', (e) => {
                setError(`Security failure: ${e.detail.status}`)
                setStatus('error')
            })

            return () => {
                if (rfbRef.current) {
                    rfbRef.current.disconnect()
                    rfbRef.current = null
                }
            }

        } catch (err) {
            setError(`Failed to initialize VNC: ${err.message}`)
            setStatus('error')
        }
    }, [host, port, password])

    // Monitor screen size changes from the canvas
    useEffect(() => {
        if (!rfbRef.current) return

        const checkSize = () => {
            const canvas = canavsWrapperRef.current.querySelector('canvas')
            if (canvas) {
                if (canvas.width !== screenWidth || canvas.height !== screenHeight) {
                    setScreenWidth(canvas.width)
                    setScreenHeight(canvas.height)
                    onScreenSize?.(canvas.width, canvas.height)
                }
            }
        }

        const interval = setInterval(checkSize, 1000)
        return () => clearInterval(interval)
    }, [screenWidth, screenHeight, onScreenSize])

    // Track recording start/stop for timing measurements
    useEffect(() => {
        if (isRecording) {
            recordingStartTimeRef.current = Date.now()
            lastActionTimeRef.current = Date.now()
        } else {
            recordingStartTimeRef.current = null
            lastActionTimeRef.current = null
        }
    }, [isRecording])

    // Handle OCR when modal opens
    useEffect(() => {
        if (ocrModal.isOpen && ocrModal.isLoading && ocrPendingImage) {
            vncApi.ocr(ocrPendingImage)
                .then(result => {
                    setOcrModal(prev => ({
                        ...prev,
                        isLoading: false,
                        detectedText: result.text || ''
                    }))
                    setOcrPendingImage(null)
                })
                .catch(err => {
                    console.error('OCR failed:', err)
                    setOcrModal(prev => ({
                        ...prev,
                        isLoading: false,
                        detectedText: '[OCR Failed]'
                    }))
                    setOcrPendingImage(null)
                })
        }
    }, [ocrModal.isOpen, ocrModal.isLoading, ocrPendingImage])

    // Handle Scroll (Wheel) Events
    const handleWheelCapture = useCallback((e) => {
        if (!isRecording || isPaused || isVerifyMode || isVerifyTextMode) return

        const canvas = canavsWrapperRef.current.querySelector('canvas')
        if (!canvas) return

        // Prevent default scroll
        e.preventDefault()

        const coords = scaleCoordinates(
            e.clientX,
            e.clientY,
            canvas,
            screenWidth,
            screenHeight
        )

        const now = Date.now()
        let delay_before = 0
        if (lastActionTimeRef.current !== null) {
            delay_before = Math.round((now - lastActionTimeRef.current) / 100) / 10
        }
        lastActionTimeRef.current = now

        const stepData = {
            type: 'scroll',
            direction: e.deltaY > 0 ? 'down' : 'up',
            clicks: 1, // Single scroll tick
            x: coords.x,
            y: coords.y,
            description: `Scroll ${e.deltaY > 0 ? 'down' : 'up'} at (${coords.x}, ${coords.y})`,
            timestamp: now,
            delay_before
        }

        console.log('[VNC] Sending Step (Scroll):', stepData)
        onStep?.(stepData)
        onInteraction?.(stepData)
    }, [isRecording, isPaused, screenWidth, screenHeight, onStep, onInteraction, isVerifyMode, isVerifyTextMode])

    // Manually attach wheel listener to avoid "passive event listener" error when calling preventDefault
    // We use capture: true to ensure we see the event before noVNC intercepts it
    useEffect(() => {
        const wrapper = canavsWrapperRef.current
        if (!wrapper) return

        wrapper.addEventListener('wheel', handleWheelCapture, { passive: false, capture: true })
        return () => {
            wrapper.removeEventListener('wheel', handleWheelCapture, { capture: true })
        }
    }, [handleWheelCapture])

    // Drag detection state
    const dragDataRef = useRef(null)
    const clickTimeoutRef = useRef(null)

    // Handle Mouse interactions
    const handleMouseDown = useCallback((e) => {
        console.log('[VNC] MouseDown event detected. Recording:', isRecording, 'Paused:', isPaused)
        if (!isRecording && !onInteraction) return
        if (isRecording && isPaused) return

        const canvas = canavsWrapperRef.current.querySelector('canvas')
        if (!canvas) return

        const rect = canvas.getBoundingClientRect()
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top

        if (isRecording && (isVerifyMode || isVerifyTextMode)) {
            e.stopPropagation()
            e.preventDefault()
            setIsSelecting(true)
            setSelectionStart({ x: mouseX, y: mouseY })
            setSelectionRect({ x: mouseX, y: mouseY, width: 0, height: 0 })
            return
        }

        // Initialize drag detection for left button
        if (isRecording && e.button === 0) {
            const coords = scaleCoordinates(e.clientX, e.clientY, canvas, screenWidth, screenHeight)
            dragDataRef.current = {
                startX: coords.x,
                startY: coords.y,
                clientStartX: e.clientX,
                clientStartY: e.clientY,
                isDragging: false,
                button: e.button,
                detail: e.detail
            }
        } else {
            // Right click or others: process immediately as before
            processMouseAction(e)
        }
    }, [isRecording, isPaused, screenWidth, screenHeight, onStep, onInteraction, isSmartRecord, isVerifyMode, isVerifyTextMode])

    const handleMouseMoveCapture = useCallback((e) => {
        if (!dragDataRef.current || dragDataRef.current.isDragging) return

        // Check 10px threshold
        const dx = Math.abs(e.clientX - dragDataRef.current.clientStartX)
        const dy = Math.abs(e.clientY - dragDataRef.current.clientStartY)

        if (dx > 10 || dy > 10) {
            dragDataRef.current.isDragging = true
            console.log('[VNC] Drag threshold met (10px)')
        }
    }, [])

    const handleMouseUpCapture = useCallback((e) => {
        if (!dragDataRef.current) return

        if (dragDataRef.current.isDragging) {
            const canvas = canavsWrapperRef.current.querySelector('canvas')
            const coords = scaleCoordinates(e.clientX, e.clientY, canvas, screenWidth, screenHeight)

            const now = Date.now()
            let delay_before = 0
            if (lastActionTimeRef.current !== null) {
                delay_before = Math.round((now - lastActionTimeRef.current) / 100) / 10
            }
            lastActionTimeRef.current = now

            const stepData = {
                type: 'drag',
                x: dragDataRef.current.startX,
                y: dragDataRef.current.startY,
                end_x: coords.x,
                end_y: coords.y,
                description: `Drag from (${dragDataRef.current.startX}, ${dragDataRef.current.startY}) to (${coords.x}, ${coords.y})`,
                timestamp: now,
                delay_before
            }

            console.log('[VNC] Sending Step (Drag):', stepData)
            onStep?.(stepData)
            onInteraction?.(stepData)
        } else {
            // Not a drag, process as a normal click
            processMouseAction(e, dragDataRef.current.button, dragDataRef.current.detail)
        }

        dragDataRef.current = null
    }, [isRecording, isPaused, screenWidth, screenHeight, onStep, onInteraction])

    const processMouseAction = (e, forcedButton = null, forcedDetail = null) => {
        const canvas = canavsWrapperRef.current.querySelector('canvas')
        if (!canvas) return

        const button = forcedButton !== null ? forcedButton : e.button
        const detail = forcedDetail !== null ? forcedDetail : e.detail

        const coords = scaleCoordinates(
            e.clientX,
            e.clientY,
            canvas,
            screenWidth,
            screenHeight
        )

        const now = Date.now()
        let delay_before = 0
        if (lastActionTimeRef.current !== null) {
            delay_before = Math.round((now - lastActionTimeRef.current) / 100) / 10
        }
        lastActionTimeRef.current = now

        // Deduplication: If we see a click, wait a bit to see if it becomes a double-click
        if (clickTimeoutRef.current) {
            clearTimeout(clickTimeoutRef.current)
            clickTimeoutRef.current = null
        }

        const stepData = {
            type: button === 2 ? 'right_click' : (detail === 2 ? 'double_click' : 'click'),
            x: coords.x,
            y: coords.y,
            description: `Click at (${coords.x}, ${coords.y})`,
            timestamp: now,
            delay_before
        }

        // Smart Record Logic
        if (isRecording && isSmartRecord) {
            try {
                const size = 80
                const rect = canvas.getBoundingClientRect()
                const captureX = Math.max(0, e.clientX - rect.left - (size / 2))
                const captureY = Math.max(0, e.clientY - rect.top - (size / 2))

                const scaleX = canvas.width / rect.width
                const scaleY = canvas.height / rect.height

                const remoteWidth = Math.round(size * scaleX)
                const remoteHeight = Math.round(size * scaleY)

                const tempCanvas = document.createElement('canvas')
                tempCanvas.width = remoteWidth
                tempCanvas.height = remoteHeight
                const ctx = tempCanvas.getContext('2d')

                ctx.drawImage(
                    canvas,
                    captureX * scaleX, captureY * scaleY, remoteWidth, remoteHeight,
                    0, 0, remoteWidth, remoteHeight
                )

                stepData.smartTemplate = tempCanvas.toDataURL('image/png')
                stepData.type = 'smart_click'
                stepData.originalType = button === 2 ? 'right_click' : (detail === 2 ? 'double_click' : 'click')
            } catch (err) {
                console.error("Smart Capture Failed:", err)
            }
        }

        const commitAction = () => {
            if (isRecording) {
                onStep?.(stepData)
            }
            if (onInteraction) {
                onInteraction(stepData)
            }
            clickTimeoutRef.current = null
        }

        if (stepData.type === 'click' || (stepData.type === 'smart_click' && stepData.originalType === 'click')) {
            // Buffer single clicks (including smart clicks)
            clickTimeoutRef.current = setTimeout(commitAction, 250)
        } else {
            // Right-click or double-click: commit immediately
            commitAction()
        }
    }

    // Window-level mouseup and mousemove for selection robustness
    useEffect(() => {
        if (!isSelecting) return

        const handleGlobalMouseMove = (e) => {
            const canvas = canavsWrapperRef.current.querySelector('canvas')
            if (!canvas || !selectionStart) return

            const rect = canvas.getBoundingClientRect()
            const mouseX = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
            const mouseY = Math.max(0, Math.min(rect.height, e.clientY - rect.top))

            setSelectionRect({
                x: Math.min(selectionStart.x, mouseX),
                y: Math.min(selectionStart.y, mouseY),
                width: Math.abs(mouseX - selectionStart.x),
                height: Math.abs(mouseY - selectionStart.y)
            })
        }

        const handleGlobalMouseUp = (e) => {
            const canvas = canavsWrapperRef.current.querySelector('canvas')
            if (!canvas || !selectionRect || selectionRect.width < 5 || selectionRect.height < 5) {
                setIsSelecting(false)
                setSelectionStart(null)
                setSelectionRect(null)
                return
            }

            try {
                const scaleX = canvas.width / canvas.getBoundingClientRect().width
                const scaleY = canvas.height / canvas.getBoundingClientRect().height

                const remoteX = Math.round(selectionRect.x * scaleX)
                const remoteY = Math.round(selectionRect.y * scaleY)
                const remoteWidth = Math.max(1, Math.round(selectionRect.width * scaleX))
                const remoteHeight = Math.max(1, Math.round(selectionRect.height * scaleY))

                const tempCanvas = document.createElement('canvas')
                tempCanvas.width = remoteWidth
                tempCanvas.height = remoteHeight
                const ctx = tempCanvas.getContext('2d')

                ctx.drawImage(
                    canvas,
                    remoteX, remoteY, remoteWidth, remoteHeight,
                    0, 0, remoteWidth, remoteHeight
                )

                // Handle Verify Text Mode
                if (isVerifyTextMode) {
                    const imageData = tempCanvas.toDataURL('image/png')

                    // Store image data and region for OCR processing
                    setOcrPendingImage(imageData)

                    // Open OCR modal (selection overlay will be reset by finally block, then modal appears)
                    // We use setTimeout to ensure this happens after the current render cycle
                    setTimeout(() => {
                        setOcrModal({
                            isOpen: true,
                            detectedText: '',
                            isLoading: true,
                            region: {
                                x: Math.round(remoteX),
                                y: Math.round(remoteY),
                                width: Math.round(remoteWidth),
                                height: Math.round(remoteHeight)
                            }
                        })
                    }, 0)

                    // Let the finally block reset selection state (like Verify Image does)
                    // This ensures the selection overlay renders at least once before modal opens
                } else {
                    // Handle Verify Image Mode (original behavior)
                    const stepData = {
                        type: 'wait_for_image',
                        template_data: tempCanvas.toDataURL('image/png'),
                        x: Math.round(remoteX),
                        y: Math.round(remoteY),
                        width: Math.round(remoteWidth),
                        height: Math.round(remoteHeight),
                        region: {
                            x: Math.round(remoteX),
                            y: Math.round(remoteY),
                            width: Math.round(remoteWidth),
                            height: Math.round(remoteHeight)
                        },
                        description: `Assert image at (${Math.round(remoteX)}, ${Math.round(remoteY)})`,
                        timeout: 30.0,
                        timestamp: Date.now()
                    }

                    console.log('[VNC] Sending Assertion Step:', stepData)
                    onInteraction?.(stepData)
                    onStep?.(stepData)

                    setIsVerifyMode(false)
                }
            } catch (err) {
                console.error("Assertion Capture Failed:", err)
            } finally {
                setIsSelecting(false)
                setSelectionStart(null)
                setSelectionRect(null)
            }
        }

        window.addEventListener('mousemove', handleGlobalMouseMove)
        window.addEventListener('mouseup', handleGlobalMouseUp)
        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove)
            window.removeEventListener('mouseup', handleGlobalMouseUp)
        }
    }, [isSelecting, selectionStart, selectionRect, onInteraction, onStep, isVerifyTextMode, isVerifyMode, textVerifyPending])


    // Global Key Listener (bound to container)
    const handleKeyDown = useCallback((e) => {
        console.log('[VNC] KeyDown event detected. Key:', e.key, 'Recording:', isRecording, 'Paused:', isPaused)
        if (e.repeat) return // Ignore auto-repeat keys

        if (e.key === 'Escape' && (isVerifyMode || isVerifyTextMode)) {
            setIsVerifyMode(false)
            setIsVerifyTextMode(false)
            setTextVerifyPending(false)
            setIsSelecting(false)
            setSelectionStart(null)
            setSelectionRect(null)
            return
        }

        if (!isRecording && !onInteraction) return
        if (isRecording && isPaused) return
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

        // Prevent default browser actions for common keys
        if (['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault()
        }

        const modifiers = []
        if (e.ctrlKey) modifiers.push('ctrl')
        if (e.altKey) modifiers.push('alt')
        if (e.shiftKey) modifiers.push('shift')

        let keyName = e.key
        const specialKeys = {
            'Enter': 'enter', 'Tab': 'tab', 'Escape': 'escape',
            'Backspace': 'backspace', 'Delete': 'delete',
            'ArrowUp': 'up', 'ArrowDown': 'down', 'ArrowLeft': 'left', 'ArrowRight': 'right'
        }
        if (specialKeys[keyName]) keyName = specialKeys[keyName]

        if (playerInputIsMeaningful(keyName, modifiers)) {
            const stepData = {
                type: modifiers.length > 0 ? 'key_combo' : (keyName.length === 1 ? 'type' : 'key_press'),
                keys: modifiers.length > 0 ? [...modifiers, keyName] : [keyName],
                text: keyName.length === 1 && modifiers.length === 0 ? keyName : undefined,
                description: modifiers.length > 0 ? `Keys: ${modifiers.join('+')}+${keyName}` : (keyName.length === 1 ? `Type: ${keyName}` : `Key: ${keyName}`),
                timestamp: Date.now()
            }

            // Add delay timing
            const now = Date.now()
            let delay_before = 0
            if (lastActionTimeRef.current !== null) {
                const delayMs = now - lastActionTimeRef.current
                delay_before = Math.round(delayMs / 100) / 10  // Round to 0.1s
                console.log(`[VNC] Timing: ${delayMs}ms = ${delay_before}s since last action`)
            }
            lastActionTimeRef.current = now
            stepData.delay_before = delay_before

            if (isRecording) {
                console.log('[VNC] Sending Step (Key):', stepData)
                onStep?.(stepData)
            }

            if (onInteraction) {
                console.log('[VNC] Sending Interaction (Key):', stepData)
                onInteraction(stepData)
            }
        }
    }, [isRecording, isPaused, onStep, onInteraction])

    const playerInputIsMeaningful = (key, modifiers) => {
        if (['Shift', 'Control', 'Alt', 'Meta'].includes(key)) return false
        return true
    }

    return (
        <div
            className="vnc-viewer"
            ref={containerRef}
            tabIndex={0}
            onKeyDownCapture={handleKeyDown}
        >
            {/* Status Bar */}
            <div className="vnc-toolbar">
                <div className="vnc-info">
                    <span className={`connection-status ${status}`}>●</span>
                    <span>{host}:{port}</span>
                    <span className="screen-size">{screenWidth}×{screenHeight}</span>
                </div>

                <div className="vnc-actions">
                    {/* Recording Controls - only show when not running */}
                    {!isRunning && !isRecording && (
                        <button
                            className="btn btn-sm btn-ghost recording-start-btn"
                            onClick={onToggleRecording}
                            title="Start Recording"
                        >
                            <Aperture size={16} /> Start Recording
                        </button>
                    )}
                    {isRecording && (
                        <>
                            <button
                                className="btn btn-sm btn-recording-active recording-stop-btn"
                                onClick={onToggleRecording}
                                title="Stop Recording"
                            >
                                <Square size={16} /> Stop
                            </button>

                            <div className="vnc-actions-divider"></div>

                            <button
                                className={`btn btn-sm ${isVerifyMode ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => {
                                    if (isVerifyMode) {
                                        setIsVerifyMode(false)
                                    } else {
                                        setIsVerifyTextMode(false)
                                        setIsVerifyMode(true)
                                    }
                                }}
                                title="Verify Image Mode (Capture Image Assertion)"
                            >
                                <Shield size={16} /> {isVerifyMode ? 'Cancel Verify' : 'Verify Image'}
                            </button>

                            <button
                                className={`btn btn-sm ${isVerifyTextMode ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => {
                                    if (isVerifyTextMode) {
                                        setIsVerifyTextMode(false)
                                    } else {
                                        setIsVerifyMode(false)
                                        setIsVerifyTextMode(true)
                                    }
                                }}
                                title="Verify Text Mode (Capture Text Assertion)"
                            >
                                <Type size={16} /> {isVerifyTextMode ? 'Cancel Verify' : 'Verify Text'}
                            </button>

                            <div className="vnc-actions-divider"></div>

                            <button
                                className={`btn btn-sm ${isSmartRecord ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => {
                                    const next = !isSmartRecord
                                    setIsSmartRecord(next)
                                    if (next) setIsCoordinates(false)
                                }}
                                title="Smart Matching (Image-based)"
                            >
                                <Aperture size={16} /> Smart
                            </button>

                            <button
                                className={`btn btn-sm ${isCoordinates ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => {
                                    const next = !isCoordinates
                                    setIsCoordinates(next)
                                    if (next) setIsSmartRecord(false)
                                }}
                                title="Coordinate Mode (Grid-based)"
                            >
                                <Monitor size={16} /> Coords
                            </button>

                            <div className="vnc-actions-divider"></div>
                        </>
                    )}

                    <button
                        className="btn btn-sm btn-ghost"
                        onClick={onDisconnect}
                        title="Disconnect"
                    >
                        <Power size={16} /> Disconnect
                    </button>

                    {isRunning && !isRecording && (
                        <>
                            <div className="vnc-actions-divider"></div>
                            <button
                                className={`btn btn-sm ${isPaused ? 'btn-pause-active' : 'btn-warning'}`}
                                onClick={onPauseRecording}
                                title={isPaused ? "Resume Run" : "Pause Run"}
                            >
                                {isPaused ? <Play size={16} /> : <Square size={16} />}
                                {isPaused ? 'Resume' : 'Pause'}
                            </button>
                            <button
                                className="btn btn-sm btn-danger"
                                onClick={onStopRun}
                                title="Stop Run"
                            >
                                <Square size={16} /> Stop Run
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Canvas Container */}
            <div className="vnc-canvas-container">
                <div
                    ref={canavsWrapperRef}
                    className={`vnc-canvas-wrapper ${(isVerifyMode || isVerifyTextMode) ? 'verify-mode' : ''}`}
                    onMouseDownCapture={handleMouseDown}
                    onMouseMoveCapture={handleMouseMoveCapture}
                    onMouseUpCapture={handleMouseUpCapture}
                >
                    {/* Structural Shield to block all noVNC events in Verify Mode */}
                    {(isVerifyMode || isVerifyTextMode) && (
                        <div className="vnc-verify-shield" />
                    )}

                    {/* Selection Overlay - shown when selecting OR when text verify is pending */}
                    {(isSelecting || textVerifyPending) && selectionRect && (
                        <div
                            className="vnc-selection-overlay"
                            style={{
                                left: selectionRect.x,
                                top: selectionRect.y,
                                width: selectionRect.width,
                                height: selectionRect.height
                            }}
                        >
                            <div className="vnc-selection-label">Assertion Area</div>
                        </div>
                    )}

                    {/* Verify Mode Instructions */}
                    {(isVerifyMode || isVerifyTextMode) && !isSelecting && (
                        <div className="vnc-verify-instruction">
                            {isVerifyTextMode ? <Type size={16} className="mr-2" /> : <Shield size={16} className="mr-2" />}
                            {isVerifyTextMode
                                ? 'Click and drag to capture text for verification'
                                : 'Click and drag to capture an assertion'}
                            <span className="ml-2 opacity-50 text-xs">(Esc to cancel)</span>
                        </div>
                    )}
                </div>

                {/* Recording Indicator */}
                {isRecording && (
                    <div className={`recording-indicator ${isPaused ? 'paused' : ''}`}>
                        <span className="recording-dot"></span>
                        {isPaused ? 'PAUSED' : 'REC'}
                    </div>
                )}

                {/* Loading / Error States */}
                {status === 'connecting' && (
                    <div className="vnc-overlay">
                        <div className="spinner"></div>
                        <p>Connecting to desktop...</p>
                    </div>
                )}

                {status === 'error' && (
                    <div className="vnc-overlay error">
                        <AlertTriangle size={32} className="mb-4" />
                        <p>{error || 'Connection Failed'}</p>
                        <button className="btn btn-primary" onClick={onDisconnect}>Back</button>
                    </div>
                )}
            </div>

            {/* Placeholder/Disconnected State */}
            {!host && (
                <div className="vnc-placeholder-display">
                    <div className="placeholder-content">
                        <Monitor size={48} className="text-gray-500 mb-4" />
                        <h2>Connect to VNC</h2>
                        <p>Click the button below to connect to a VNC server</p>
                    </div>
                </div>
            )}

            {/* OCR Confirmation Modal */}
            {ocrModal.isOpen && (
                <div className="ocr-modal-overlay">
                    <div className="ocr-modal">
                        <div className="ocr-modal-header">
                            <Type size={18} />
                            <h3>Verify Text</h3>
                            <button
                                className="ocr-modal-close"
                                onClick={() => {
                                    setOcrModal({ isOpen: false, detectedText: '', isLoading: false, region: null })
                                    setIsVerifyTextMode(false)
                                    setTextVerifyPending(false)
                                    setIsSelecting(false)
                                    setSelectionStart(null)
                                    setSelectionRect(null)
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="ocr-modal-body">
                            {ocrModal.isLoading ? (
                                <div className="ocr-loading">
                                    <div className="spinner"></div>
                                    <p>Extracting text...</p>
                                </div>
                            ) : (
                                <>
                                    <p className="ocr-instruction">Is this the correct text?</p>
                                    <textarea
                                        className="ocr-textarea"
                                        value={ocrModal.detectedText}
                                        onChange={(e) => setOcrModal(prev => ({ ...prev, detectedText: e.target.value }))}
                                        placeholder="Detected text will appear here..."
                                        rows={4}
                                    />
                                </>
                            )}
                        </div>

                        <div className="ocr-modal-footer">
                            <button
                                className="btn btn-ghost"
                                onClick={() => {
                                    setOcrModal({ isOpen: false, detectedText: '', isLoading: false, region: null })
                                    setIsVerifyTextMode(false)
                                    setTextVerifyPending(false)
                                    setIsSelecting(false)
                                    setSelectionStart(null)
                                    setSelectionRect(null)
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary"
                                disabled={!ocrModal.detectedText || ocrModal.detectedText === '[OCR Failed]'}
                                onClick={() => {
                                    // Add wait_for_text step
                                    const stepData = {
                                        type: 'wait_for_text',
                                        text: ocrModal.detectedText,
                                        region: ocrModal.region,
                                        x: Math.round(ocrModal.region.x + ocrModal.region.width / 2),
                                        y: Math.round(ocrModal.region.y + ocrModal.region.height / 2),
                                        description: `Wait for text: "${ocrModal.detectedText.substring(0, 30)}${ocrModal.detectedText.length > 30 ? '...' : ''}"`,
                                        timeout: 30.0,
                                        timestamp: Date.now()
                                    }
                                    console.log('[VNC] Sending Wait for Text Step:', stepData)
                                    onInteraction?.(stepData)
                                    onStep?.(stepData)

                                    // Close modal and reset selection state
                                    setOcrModal({ isOpen: false, detectedText: '', isLoading: false, region: null })
                                    setIsVerifyTextMode(false)
                                    setTextVerifyPending(false)
                                    setIsSelecting(false)
                                    setSelectionStart(null)
                                    setSelectionRect(null)
                                }}
                            >
                                <Check size={16} /> Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
