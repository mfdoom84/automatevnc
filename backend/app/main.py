"""
AutoVNC Backend - Main Application

FastAPI application for the AutoVNC automation platform.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings, ensure_directories
from .routers import (
    scripts_router,
    runs_router,
    ai_router,
    vnc_router,
    settings_router
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    print("🚀 Starting AutoVNC Backend...")
    ensure_directories()
    print(f"📁 Data directory: {settings.data_dir}")
    print(f"🤖 AI Provider: {settings.ai_provider}")
    yield
    # Shutdown
    print("👋 Shutting down AutoVNC Backend...")


# Create FastAPI application
app = FastAPI(
    title="AutoVNC API",
    description="VNC Automation IDE Backend - Record, refine, and execute VNC automations",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(scripts_router)
app.include_router(runs_router)
app.include_router(ai_router)
app.include_router(vnc_router)
app.include_router(settings_router)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "AutoVNC API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/api/settings/health"
    }


@app.get("/api")
async def api_info():
    """API information endpoint."""
    return {
        "endpoints": {
            "scripts": "/api/scripts",
            "runs": "/api/runs",
            "ai": "/api/ai",
            "vnc": "/api/vnc",
            "settings": "/api/settings"
        }
    }
