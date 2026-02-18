"""
Scripts Router

API endpoints for script CRUD operations.
"""

from typing import List
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
import os
import aiofiles

from ..models import (
    Script, ScriptListItem, CreateScriptRequest, UpdateScriptRequest,
    EjectScriptResponse
)
from pydantic import BaseModel
from ..services import script_service
from ..config import settings

router = APIRouter(prefix="/api/scripts", tags=["scripts"])


@router.get("", response_model=List[ScriptListItem])
async def list_scripts():
    """List all scripts."""
    return await script_service.list_scripts()


@router.get("/{name}", response_model=Script)
async def get_script(name: str):
    """Get a script by name."""
    try:
        script = await script_service.get_script(name)
        if not script:
            raise HTTPException(
                status_code=404,
                detail=f"Script '{name}' not found"
            )
        return script
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get script: {str(e)}"
        )


@router.post("", response_model=Script, status_code=201)
async def create_script(request: CreateScriptRequest):
    """Create a new script."""
    # Check if script already exists
    existing = await script_service.get_script(request.name)
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Script '{request.name}' already exists"
        )
    
    return await script_service.create_script(request)


@router.put("/{name}", response_model=Script)
async def update_script(name: str, request: UpdateScriptRequest):
    """Update an existing script."""
    try:
        script = await script_service.update_script(name, request)
        if not script:
            raise HTTPException(
                status_code=404,
                detail=f"Script '{name}' not found"
            )
        return script
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.delete("/{name}")
async def delete_script(name: str):
    """Delete a script."""
    if not await script_service.delete_script(name):
        raise HTTPException(
            status_code=404,
            detail=f"Script '{name}' not found"
        )
    return {"message": f"Script '{name}' deleted"}


@router.post("/{name}/eject", response_model=EjectScriptResponse)
async def eject_script(name: str):
    """Convert a script's visual steps to Python code."""
    code = await script_service.eject_to_code(name)
    if code is None:
        raise HTTPException(
            status_code=404,
            detail=f"Script '{name}' not found"
        )
    
    return EjectScriptResponse(
        code=code,
        message=f"Script '{name}' ejected to Python code successfully"
    )


@router.get("/{name}/code")
async def get_script_code(name: str):
    """Get the Python code for a script."""
    script = await script_service.get_script(name)
    if not script:
        raise HTTPException(
            status_code=404,
            detail=f"Script '{name}' not found"
        )
    
    if not script.code:
        # Generate code on-the-fly without saving
        code = script_service.generate_code(script)
        return {"code": code, "is_saved": False}
    
    return {"code": script.code, "is_saved": True}


@router.get("/{name}/templates")
async def list_templates(name: str):
    """List image templates for a script."""
    script = await script_service.get_script(name)
    if not script:
        raise HTTPException(
            status_code=404,
            detail=f"Script '{name}' not found"
        )
    
    return {"templates": script.templates}


class SmartTemplateRequest(BaseModel):
    image: str


@router.post("/{name}/smart-template")
async def create_smart_template(name: str, request: SmartTemplateRequest):
    """
    Upload a base64 image, automatically name it using OCR, and save it.
    """
    script = await script_service.get_script(name)
    if not script:
        raise HTTPException(
            status_code=404,
            detail=f"Script '{name}' not found"
        )
    
    try:
        filename = await script_service.save_template(name, request.image)
        return {"filename": filename}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to save template: {str(e)}")


@router.post("/{name}/templates")
async def upload_template(
    name: str,
    file: UploadFile = File(...),
    template_name: str = Form(None)
):
    """Upload an image template for a script."""
    script = await script_service.get_script(name)
    if not script:
        raise HTTPException(
            status_code=404,
            detail=f"Script '{name}' not found"
        )
    
    # Determine filename
    filename = template_name or file.filename
    if not filename.endswith('.png'):
        filename += '.png'
    
    # Save template
    templates_dir = os.path.join(settings.templates_dir, name)
    os.makedirs(templates_dir, exist_ok=True)
    
    template_path = os.path.join(templates_dir, filename)
    
    async with aiofiles.open(template_path, 'wb') as f:
        content = await file.read()
        await f.write(content)
    
    return {
        "message": f"Template '{filename}' uploaded",
        "path": template_path
    }


@router.get("/{name}/templates/{template_name}")
async def get_template(name: str, template_name: str):
    """Get an image template."""
    template_path = os.path.join(
        settings.templates_dir, name, template_name
    )
    
    if not os.path.exists(template_path):
        raise HTTPException(
            status_code=404,
            detail=f"Template '{template_name}' not found"
        )
    
    return FileResponse(template_path, media_type="image/png")


@router.delete("/{name}/templates/{template_name}")
async def delete_template(name: str, template_name: str):
    """Delete an image template."""
    template_path = os.path.join(
        settings.templates_dir, name, template_name
    )
    
    if not os.path.exists(template_path):
        raise HTTPException(
            status_code=404,
            detail=f"Template '{template_name}' not found"
        )
    
    os.remove(template_path)
    return {"message": f"Template '{template_name}' deleted"}
