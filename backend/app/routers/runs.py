"""
Runs Router

API endpoints for script execution and run management.
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
import os
import aiofiles

from ..models import (
    Run, RunStatus, RunStatusResponse, RunLogsResponse,
    RunScriptRequest
)
from ..services import run_service, script_service

router = APIRouter(prefix="/api", tags=["runs"])


@router.post("/scripts/{name}/run", response_model=Run, status_code=202)
async def run_script(name: str, request: RunScriptRequest):
    """
    Trigger a headless script execution.
    
    Returns a run ID that can be used to check status and fetch logs.
    """
    # Verify script exists
    script = await script_service.get_script(name)
    if not script:
        raise HTTPException(status_code=404, detail=f"Script '{name}' not found")
    
    # Verify chained scripts exist
    if request.chain:
        for chain_name in request.chain:
            chain_script = await script_service.get_script(chain_name)
            if not chain_script:
                raise HTTPException(
                    status_code=404,
                    detail=f"Chained script '{chain_name}' not found"
                )
    
    # Create and queue the run
    run = await run_service.create_run(
        script_name=name,
        vnc=request.vnc,
        chain=request.chain,
        variables=request.variables
    )
    
    return run


@router.get("/runs", response_model=List[Run])
async def list_runs(limit: int = 50):
    """List recent runs."""
    return await run_service.list_runs(limit)


@router.get("/runs/{run_id}", response_model=Run)
async def get_run(run_id: str):
    """Get run details."""
    run = await run_service.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    return run


@router.get("/runs/{run_id}/status", response_model=RunStatusResponse)
async def get_run_status(run_id: str):
    """Get run status."""
    run = await run_service.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    
    return RunStatusResponse(
        id=run.id,
        status=run.status,
        started_at=run.started_at,
        completed_at=run.completed_at,
        exit_code=run.exit_code,
        error_message=run.error_message
    )


@router.get("/runs/{run_id}/logs", response_model=RunLogsResponse)
async def get_run_logs(run_id: str):
    """Get run execution logs."""
    run = await run_service.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    
    logs = await run_service.get_run_logs(run_id)
    
    return RunLogsResponse(
        id=run_id,
        logs=logs or "",
        is_complete=run.status in [RunStatus.SUCCESS, RunStatus.FAILED, RunStatus.CANCELLED],
        status=run.status
    )


@router.post("/runs/{run_id}/cancel", response_model=Run)
async def cancel_run(run_id: str):
    """Cancel a running script execution."""
    run = await run_service.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    
    success = await run_service.cancel_run(run_id)
    if not success:
        raise HTTPException(status_code=400, detail="Could not cancel run (not running or already completed)")
    
    return await run_service.get_run(run_id)


@router.get("/runs/{run_id}/artifacts")
async def get_run_artifacts(run_id: str):
    """Get run artifact information."""
    run = await run_service.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    
    artifacts = await run_service.get_run_artifacts(run_id)
    
    return {
        "run_id": run_id,
        "artifacts": {
            "log": f"/api/runs/{run_id}/artifacts/log" if artifacts.get("log") else None,
            "screenshot": f"/api/runs/{run_id}/artifacts/screenshot" if artifacts.get("screenshot") else None
        }
    }


@router.get("/runs/{run_id}/artifacts/log")
async def download_run_log(run_id: str):
    """Download run log file."""
    run = await run_service.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    
    artifacts = await run_service.get_run_artifacts(run_id)
    log_path = artifacts.get("log")
    
    if not log_path or not os.path.exists(log_path):
        raise HTTPException(status_code=404, detail="Log file not found")
    
    return FileResponse(
        log_path,
        media_type="text/plain",
        filename=f"run_{run_id}_execution.log"
    )


@router.get("/runs/{run_id}/artifacts/screenshot")
async def download_failure_screenshot(run_id: str):
    """Download failure screenshot."""
    run = await run_service.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    
    artifacts = await run_service.get_run_artifacts(run_id)
    screenshot_path = artifacts.get("screenshot")
    
    if not screenshot_path or not os.path.exists(screenshot_path):
        raise HTTPException(status_code=404, detail="Screenshot not found")
    
    return FileResponse(
        screenshot_path,
        media_type="image/png",
        filename=f"run_{run_id}_failure.png"
    )


@router.delete("/runs/{run_id}", status_code=204)
async def delete_run(run_id: str):
    """Delete a run and all its associated data (logs, screenshots)."""
    run = await run_service.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    
    success = await run_service.delete_run(run_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete run")
    
    return None
