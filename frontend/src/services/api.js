/**
 * API Service
 * 
 * Handles all communication with the AutoVNC backend.
 */

import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
    baseURL: API_BASE,
    headers: {
        'Content-Type': 'application/json'
    }
});

// =============================================================================
// Scripts API
// =============================================================================

export const scriptsApi = {
    list: () => api.get('/scripts').then(r => r.data),

    get: (name) => api.get(`/scripts/${name}`).then(r => r.data),

    create: (data) => api.post('/scripts', data).then(r => r.data),

    update: (name, data) => api.put(`/scripts/${name}`, data).then(r => r.data),

    delete: (name) => api.delete(`/scripts/${name}`).then(r => r.data),

    eject: (name) => api.post(`/scripts/${name}/eject`).then(r => r.data),

    getCode: (name) => api.get(`/scripts/${name}/code`).then(r => r.data),

    listTemplates: (name) => api.get(`/scripts/${name}/templates`).then(r => r.data),

    uploadTemplate: (name, file, templateName) => {
        const formData = new FormData();
        formData.append('file', file);
        if (templateName) formData.append('template_name', templateName);
        return api.post(`/scripts/${name}/templates`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        }).then(r => r.data);
    },

    createSmartTemplate: (name, imageBase64) =>
        api.post(`/scripts/${name}/smart-template`, { image: imageBase64 }).then(r => r.data),

    deleteTemplate: (name, templateName) =>
        api.delete(`/scripts/${name}/templates/${templateName}`).then(r => r.data)
};

// =============================================================================
// Runs API
// =============================================================================

export const runsApi = {
    trigger: (scriptName, vnc, options = {}) =>
        api.post(`/scripts/${scriptName}/run`, {
            vnc,
            variables: options.variables,
            chain: options.chain
        }).then(r => r.data),

    list: (limit = 50) => api.get(`/runs?limit=${limit}`).then(r => r.data),

    get: (id) => api.get(`/runs/${id}`).then(r => r.data),

    getStatus: (id) => api.get(`/runs/${id}/status`).then(r => r.data),

    getLogs: (id) => api.get(`/runs/${id}/logs`).then(r => r.data),

    getArtifacts: (id) => api.get(`/runs/${id}/artifacts`).then(r => r.data),

    cancel: (id) => api.post(`/runs/${id}/cancel`).then(r => r.data),

    delete: (id) => api.delete(`/runs/${id}`).then(r => r.data)
};

// =============================================================================
// AI API
// =============================================================================

export const aiApi = {
    suggest: (code, mode = "visual", instructions = null, screenText = null, highlightedLines = null) =>
        api.post('/ai/suggest', {
            code,
            mode,
            instructions,
            screen_text: screenText,
            highlighted_lines: highlightedLines
        }).then(r => r.data),

    generate: (prompt, currentCode = null, screenText = null) =>
        api.post('/ai/generate', {
            prompt,
            current_code: currentCode,
            screen_text: screenText
        }).then(r => r.data),

    analyzeFailure: (runId, code) =>
        api.post('/ai/analyze-failure', {
            run_id: runId,
            code
        }).then(r => r.data),

    getStatus: () => api.get('/ai/status').then(r => r.data)
};

// =============================================================================
// VNC API
// =============================================================================

export const vncApi = {
    testConnection: (host, port = 5900) =>
        api.get(`/vnc/test?host=${encodeURIComponent(host)}&port=${port}`).then(r => r.data),

    getProxyUrl: (host, port = 5900) => {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.location.host;
        return `${wsProtocol}//${wsHost}/api/vnc/proxy?host=${encodeURIComponent(host)}&port=${port}`;
    },

    ocr: (imageBase64, lang = 'eng') =>
        api.post('/vnc/ocr', { image: imageBase64, lang }).then(r => r.data)
};

// =============================================================================
// Settings API
// =============================================================================

export const settingsApi = {
    get: () => api.get('/settings').then(r => r.data),

    update: (data) => api.put('/settings', data).then(r => r.data),

    health: () => api.get('/settings/health').then(r => r.data)
};

export default {
    scripts: scriptsApi,
    runs: runsApi,
    ai: aiApi,
    vnc: vncApi,
    settings: settingsApi
};
