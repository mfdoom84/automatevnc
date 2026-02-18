import React from 'react';
import './ApiDocs.css';
import { ExternalLink } from 'lucide-react';

export default function ApiDocs({ onClose }) {
    return (
        <div className="api-docs-container">
            <div className="api-docs-header">
                <h2>API Documentation</h2>
                <div className="api-docs-actions">
                    <a href="http://localhost:8080/docs" target="_blank" rel="noopener noreferrer" className="btn btn-ghost" title="Open in new tab">
                        <ExternalLink size={16} /> Open in New Tab
                    </a>
                </div>
            </div>
            <div className="api-docs-content">
                <iframe
                    src="/docs"
                    title="API Docs"
                    className="api-docs-iframe"
                />
            </div>
        </div>
    );
}
