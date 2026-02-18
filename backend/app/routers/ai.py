"""
AI Router

API endpoints for AI-powered assistance features.
"""

from fastapi import APIRouter, HTTPException

from ..models import (
    AISuggestRequest, AISuggestResponse,
    AIGenerateRequest, AIGenerateResponse,
    AIAnalyzeFailureRequest, AIAnalyzeFailureResponse
)
from ..services import ai_service, run_service

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/suggest", response_model=AISuggestResponse)
async def get_suggestions(request: AISuggestRequest):
    """
    Get robustness suggestions for automation code.
    
    Analyzes the code and suggests improvements like:
    - Replacing coordinate clicks with image-based clicks
    - Adding wait_for_image before interactions
    - Wrapping blind clicks in conditional checks
    """
    if not ai_service.is_configured():
        raise HTTPException(
            status_code=503,
            detail="AI service not configured. Please set your API key in settings."
        )
    
    result = await ai_service.get_robustness_suggestions(
        code=request.code,
        mode=request.mode,
        screen_text=request.screen_text,
        highlighted_lines=request.highlighted_lines,
        instructions=request.instructions
    )
    
    return AISuggestResponse(
        suggestions=result.get("suggestions", []),
        improved_code=result.get("improved_code")
    )


@router.post("/generate", response_model=AIGenerateResponse)
async def generate_code(request: AIGenerateRequest):
    """
    Generate automation code from natural language.
    
    Examples:
    - "Click the login button and type 'admin' in the username field"
    - "Wait for the loading spinner to disappear, then click Submit"
    - "Open the start menu and type 'CMD'"
    """
    if not ai_service.is_configured():
        raise HTTPException(
            status_code=503,
            detail="AI service not configured. Please set your API key in settings."
        )
    
    result = await ai_service.generate_code(
        prompt=request.prompt,
        current_code=request.current_code,
        screen_text=request.screen_text
    )
    
    return AIGenerateResponse(
        code=result.get("code", ""),
        explanation=result.get("explanation", "")
    )


@router.post("/analyze-failure", response_model=AIAnalyzeFailureResponse)
async def analyze_failure(request: AIAnalyzeFailureRequest):
    """
    Analyze a failed run and suggest fixes.
    
    Uses the failure screenshot, error message, and execution logs
    to determine what went wrong and suggest specific fixes.
    """
    if not ai_service.is_configured():
        raise HTTPException(
            status_code=503,
            detail="AI service not configured. Please set your API key in settings."
        )
    
    # Get run details
    run = await run_service.get_run(request.run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run '{request.run_id}' not found")
    
    # Get logs
    logs = await run_service.get_run_logs(request.run_id)
    
    result = await ai_service.analyze_failure(
        code=request.code,
        error_message=run.error_message or "Unknown error",
        log_content=logs
    )
    
    return AIAnalyzeFailureResponse(
        analysis=result.get("analysis", ""),
        suggested_fix=result.get("suggested_fix")
    )


@router.get("/status")
async def get_ai_status():
    """Check AI service status."""
    return {
        "configured": ai_service.is_configured(),
        "provider": ai_service.provider
    }
