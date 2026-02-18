/**
 * Coordinate Utilities
 * 
 * Handles scaling between browser canvas coordinates and VNC remote coordinates.
 */

/**
 * Scale client coordinates to remote VNC coordinates.
 * 
 * @param {number} clientX - X position in browser pixels
 * @param {number} clientY - Y position in browser pixels
 * @param {HTMLCanvasElement} canvas - The canvas element
 * @param {number} remoteWidth - VNC screen width
 * @param {number} remoteHeight - VNC screen height
 * @returns {{x: number, y: number}} Scaled coordinates
 */
export function scaleCoordinates(clientX, clientY, canvas, remoteWidth, remoteHeight) {
    const rect = canvas.getBoundingClientRect();

    // Get position relative to canvas
    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;

    // Get canvas display size
    const canvasWidth = rect.width;
    const canvasHeight = rect.height;

    // Scale to remote coordinates
    const remoteX = Math.round(canvasX * (remoteWidth / canvasWidth));
    const remoteY = Math.round(canvasY * (remoteHeight / canvasHeight));

    // Clamp to valid range
    return {
        x: Math.max(0, Math.min(remoteX, remoteWidth - 1)),
        y: Math.max(0, Math.min(remoteY, remoteHeight - 1))
    };
}

/**
 * Scale remote VNC coordinates to canvas display coordinates.
 * 
 * @param {number} remoteX - X position in VNC pixels
 * @param {number} remoteY - Y position in VNC pixels
 * @param {HTMLCanvasElement} canvas - The canvas element
 * @param {number} remoteWidth - VNC screen width
 * @param {number} remoteHeight - VNC screen height
 * @returns {{x: number, y: number}} Canvas display coordinates
 */
export function scaleToCanvas(remoteX, remoteY, canvas, remoteWidth, remoteHeight) {
    const rect = canvas.getBoundingClientRect();

    const canvasWidth = rect.width;
    const canvasHeight = rect.height;

    return {
        x: Math.round(remoteX * (canvasWidth / remoteWidth)),
        y: Math.round(remoteY * (canvasHeight / remoteHeight))
    };
}

/**
 * Scale a region from remote to canvas coordinates.
 * 
 * @param {Object} region - Region with x, y, width, height
 * @param {HTMLCanvasElement} canvas - The canvas element
 * @param {number} remoteWidth - VNC screen width
 * @param {number} remoteHeight - VNC screen height
 * @returns {Object} Scaled region
 */
export function scaleRegionToCanvas(region, canvas, remoteWidth, remoteHeight) {
    const rect = canvas.getBoundingClientRect();

    const scaleX = rect.width / remoteWidth;
    const scaleY = rect.height / remoteHeight;

    return {
        x: Math.round(region.x * scaleX),
        y: Math.round(region.y * scaleY),
        width: Math.round(region.width * scaleX),
        height: Math.round(region.height * scaleY)
    };
}

/**
 * Scale a region from canvas to remote coordinates.
 * 
 * @param {Object} region - Region with x, y, width, height
 * @param {HTMLCanvasElement} canvas - The canvas element
 * @param {number} remoteWidth - VNC screen width
 * @param {number} remoteHeight - VNC screen height
 * @returns {Object} Scaled region
 */
export function scaleRegionToRemote(region, canvas, remoteWidth, remoteHeight) {
    const rect = canvas.getBoundingClientRect();

    const scaleX = remoteWidth / rect.width;
    const scaleY = remoteHeight / rect.height;

    return {
        x: Math.round(region.x * scaleX),
        y: Math.round(region.y * scaleY),
        width: Math.round(region.width * scaleX),
        height: Math.round(region.height * scaleY)
    };
}

export default {
    scaleCoordinates,
    scaleToCanvas,
    scaleRegionToCanvas,
    scaleRegionToRemote
};
