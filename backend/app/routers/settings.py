"""
Settings Router

API endpoints for application configuration.
"""

from fastapi import APIRouter

from ..models import SettingsResponse, UpdateSettingsRequest
from ..services import ai_service
from ..config import settings as app_settings

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=SettingsResponse)
async def get_settings():
    """Get current settings (API keys are masked)."""
    return SettingsResponse(
        ai_provider=ai_service.provider,
        openai_key_configured=bool(ai_service.openai_key),
        github_key_configured=bool(ai_service.github_key)
    )


@router.put("")
async def update_settings(request: UpdateSettingsRequest):
    """Update settings including API keys."""
    ai_service.update_keys(
        openai_key=request.openai_api_key,
        github_key=request.github_models_api_key,
        provider=request.ai_provider
    )
    
    return {
        "message": "Settings updated",
        "ai_provider": ai_service.provider,
        "openai_key_configured": bool(ai_service.openai_key),
        "github_key_configured": bool(ai_service.github_key)
    }


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "version": "1.0.0",
        "data_dir": app_settings.data_dir,
        "ai_configured": ai_service.is_configured()
    }
