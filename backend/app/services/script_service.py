"""
Script Service

Handles script CRUD operations and code generation.
"""

import os
import json
import uuid
from datetime import datetime
from typing import List, Optional
import aiofiles
import base64
import re

# Try importing autovnc (will work if backend is in path)
try:
    from autovnc import vision
except ImportError:
    # Fallback for development/IDE resolving
    import sys
    sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    from autovnc import vision

from ..config import settings
from ..models import (
    Script, ScriptMetadata, ScriptListItem, Step, StepType,
    CreateScriptRequest, UpdateScriptRequest
)


class ScriptService:
    """Service for managing automation scripts."""
    
    def __init__(self):
        self.scripts_dir = settings.scripts_dir
        self.templates_dir = settings.templates_dir
    
    def _get_script_path(self, name: str) -> str:
        """Get the path to a script's JSON metadata file."""
        return os.path.join(self.scripts_dir, f"{name}.json")
    
    def _get_code_path(self, name: str) -> str:
        """Get the path to a script's Python code file."""
        return os.path.join(self.scripts_dir, f"{name}.py")
    
    def _get_templates_path(self, name: str) -> str:
        """Get the path to a script's templates directory."""
        return os.path.join(self.templates_dir, name)
    
    async def list_scripts(self) -> List[ScriptListItem]:
        """List all scripts."""
        scripts = []
        
        if not os.path.exists(self.scripts_dir):
            return scripts
        
        for filename in os.listdir(self.scripts_dir):
            if filename.endswith(".json"):
                name = filename[:-5]
                script = await self.get_script(name)
                if script:
                    scripts.append(ScriptListItem(
                        name=script.metadata.name,
                        description=script.metadata.description,
                        step_count=len(script.steps),
                        is_ejected=script.metadata.is_ejected,
                        created_at=script.metadata.created_at,
                        updated_at=script.metadata.updated_at
                    ))
        
        return sorted(scripts, key=lambda s: s.updated_at, reverse=True)
    
    async def get_script(self, name: str) -> Optional[Script]:
        """Get a script by name."""
        json_path = self._get_script_path(name)
        code_path = self._get_code_path(name)
        
        if not os.path.exists(json_path):
            return None
        
        async with aiofiles.open(json_path, 'r') as f:
            data = json.loads(await f.read())
        
        # Load code if exists
        code = None
        if os.path.exists(code_path):
            async with aiofiles.open(code_path, 'r') as f:
                code = await f.read()
        
        # Get template list
        templates = []
        templates_path = self._get_templates_path(name)
        if os.path.exists(templates_path):
            templates = [
                f for f in os.listdir(templates_path)
                if f.endswith('.png')
            ]
        
        return Script(
            metadata=ScriptMetadata(**data['metadata']),
            steps=[Step(**s) for s in data.get('steps', [])],
            code=code,
            templates=templates
        )
    
    async def create_script(self, request: CreateScriptRequest) -> Script:
        """Create a new script."""
        # Generate step IDs if not provided
        for i, step in enumerate(request.steps):
            if not step.id:
                step.id = str(uuid.uuid4())[:8]
            step.order = i
        
        metadata = ScriptMetadata(
            name=request.name,
            description=request.description,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        script = Script(
            metadata=metadata,
            steps=request.steps,
            code=None,
            templates=[]
        )
        
        # Save to disk
        await self._save_script(script)
        
        # Create templates directory
        templates_path = self._get_templates_path(request.name)
        os.makedirs(templates_path, exist_ok=True)
        
        return script
    
    async def update_script(
        self, name: str, request: UpdateScriptRequest
    ) -> Optional[Script]:
        """Update an existing script."""
        script = await self.get_script(name)
        if not script:
            return None
        
        # Handle rename
        old_name = name
        if request.name is not None and request.name != name:
            new_name = request.name
            
            # Check if new name already exists
            if os.path.exists(self._get_script_path(new_name)):
                raise ValueError(f"Script '{new_name}' already exists")
            
            # Rename JSON file
            old_json_path = self._get_script_path(old_name)
            new_json_path = self._get_script_path(new_name)
            os.rename(old_json_path, new_json_path)
            
            # Rename Python file if exists
            old_code_path = self._get_code_path(old_name)
            new_code_path = self._get_code_path(new_name)
            if os.path.exists(old_code_path):
                os.rename(old_code_path, new_code_path)
            
            # Rename templates directory if exists
            old_templates_path = self._get_templates_path(old_name)
            new_templates_path = self._get_templates_path(new_name)
            if os.path.exists(old_templates_path):
                os.rename(old_templates_path, new_templates_path)
            
            # Update script name
            script.metadata.name = new_name
        
        # Update fields
        if request.description is not None:
            script.metadata.description = request.description
        
        if request.steps is not None:
            # Assign IDs and order
            for i, step in enumerate(request.steps):
                if not step.id:
                    step.id = str(uuid.uuid4())[:8]
                step.order = i
            script.steps = request.steps
        
        if request.code is not None:
            script.code = request.code
            script.metadata.is_ejected = True
            # Save Python file
            code_path = self._get_code_path(script.metadata.name)
            async with aiofiles.open(code_path, 'w') as f:
                await f.write(request.code)
        
        script.metadata.updated_at = datetime.utcnow()
        
        # Save metadata (with new name if renamed)
        await self._save_script(script)
        
        return script
    
    async def delete_script(self, name: str) -> bool:
        """Delete a script and its templates."""
        json_path = self._get_script_path(name)
        code_path = self._get_code_path(name)
        templates_path = self._get_templates_path(name)
        
        if not os.path.exists(json_path):
            return False
        
        # Delete JSON
        os.remove(json_path)
        
        # Delete Python file if exists
        if os.path.exists(code_path):
            os.remove(code_path)
        
        # Delete templates directory
        if os.path.exists(templates_path):
            import shutil
            shutil.rmtree(templates_path)
        
        return True
    
    async def _save_script(self, script: Script) -> None:
        """Save script metadata to disk."""
        json_path = self._get_script_path(script.metadata.name)
        
        data = {
            'metadata': script.metadata.model_dump(mode='json'),
            'steps': [s.model_dump(mode='json') for s in script.steps]
        }
        
        async with aiofiles.open(json_path, 'w') as f:
            await f.write(json.dumps(data, indent=2, default=str))
    
    def generate_code(self, script: Script) -> str:
        """Generate Python code from visual steps."""
        lines = [
            '"""',
            f'AutoVNC Script: {script.metadata.name}',
            f'Generated: {datetime.utcnow().isoformat()}',
            '',
            script.metadata.description or 'No description',
            '"""',
            '',
            'from autovnc import Keys',
            '',
            '',
            'def run(vnc):',
            '    """Execute the automation script."""',
        ]
        
        if not script.steps:
            lines.append('    pass')
        else:
            for step in sorted(script.steps, key=lambda s: s.order):
                # Add wait before action if recorded timing is significant
                if step.delay_before is not None and step.delay_before > 0.1:
                    lines.append(f'    vnc.wait({step.delay_before})')
                
                code_line = self._step_to_code(step)
                if code_line:
                    lines.append(f'    {code_line}')
        
        lines.append('')
        
        # Add entry point for self-contained execution
        lines.append('if __name__ == "__main__":')
        lines.append('    from autovnc import VNCClient, ExecutionContext')
        lines.append('    import os')
        lines.append('')
        lines.append('    # Connection configuration')
        lines.append('    HOST = os.environ.get("VNC_HOST", "localhost")')
        lines.append('    PORT = int(os.environ.get("VNC_PORT", 5900))')
        lines.append('    PASSWORD = os.environ.get("VNC_PASSWORD", None)')
        lines.append('')
        lines.append('    client = VNCClient(HOST, PORT, password=PASSWORD)')
        lines.append('    try:')
        lines.append('        client.connect()')
        lines.append('        ctx = ExecutionContext(client)')
        lines.append('        run(ctx)')
        lines.append('    finally:')
        lines.append('        client.disconnect()')
        
        return '\n'.join(lines)
    
    def _step_to_code(self, step: Step) -> str:
        """Convert a step to Python code."""
        if step.type == StepType.CLICK:
            if step.template:
                return f'vnc.click("{step.template}")'
            else:
                return f'vnc.click({step.x}, {step.y})'
        
        elif step.type == StepType.DOUBLE_CLICK:
            if step.template:
                return f'vnc.double_click("{step.template}")'
            else:
                return f'vnc.double_click({step.x}, {step.y})'
        
        elif step.type == StepType.RIGHT_CLICK:
            if step.template:
                return f'vnc.right_click("{step.template}")'
            else:
                return f'vnc.right_click({step.x}, {step.y})'
        
        elif step.type == StepType.TYPE:
            keys_arg = ""
            if step.keys:
                keys_list = ', '.join([f'Keys.{k.upper()}' for k in step.keys])
                keys_arg = f', [{keys_list}]'
            text_literal = json.dumps(step.text) if step.text else '""'
            return f'vnc.type({text_literal}{keys_arg})'
        
        elif step.type == StepType.KEY_PRESS:
            if step.keys:
                keys = ', '.join([f'Keys.{k.upper()}' for k in step.keys])
                return f'vnc.press({keys})'
            return None
        
        elif step.type == StepType.KEY_COMBO:
            if step.keys:
                keys = ', '.join([f'Keys.{k.upper()}' for k in step.keys])
                return f'vnc.key_combo({keys})'
            return None
        
        elif step.type == StepType.WAIT_FOR_IMAGE:
            region_arg = ""
            if step.region:
                region_arg = f', region=({step.region.x}, {step.region.y}, {step.region.width}, {step.region.height})'
            hint_arg = f', hint=({step.x}, {step.y})' if step.x is not None and step.y is not None else ""
            return f'vnc.wait_for_image("{step.template}", timeout={step.timeout}{region_arg}{hint_arg})'
        
        elif step.type == StepType.WAIT_FOR_TEXT:
            region_arg = ""
            if step.region:
                region_arg = f', region=({step.region.x}, {step.region.y}, {step.region.width}, {step.region.height})'
            hint_arg = f', hint=({step.x}, {step.y})' if step.x is not None and step.y is not None else ""
            text_literal = json.dumps(step.text or "Success")
            return f'vnc.wait_for_text({text_literal}, timeout={step.timeout}{region_arg}{hint_arg})'
        
        elif step.type == StepType.WAIT:
            return f'vnc.wait({step.duration or 1.0})'
        
        elif step.type == StepType.SCREENSHOT:
            return 'vnc.save_screenshot("screenshot.png")'
        
        elif step.type == StepType.DRAG:
            return f'vnc.drag({step.x}, {step.y}, {step.end_x}, {step.end_y})'
        
        elif step.type == StepType.SCROLL:
            coords_arg = ""
            if step.x is not None and step.y is not None:
                coords_arg = f', x={step.x}, y={step.y}'
            return f'vnc.scroll("{step.direction}", clicks={step.clicks or 1}{coords_arg})'
        
        elif step.type == StepType.MOVE:
            return f'vnc.move({step.x}, {step.y})'
        
        return None
    
    async def save_template(self, script_name: str, image_data: str) -> str:
        """
        Save a new template image from base64 data.
        
        Args:
            script_name: Name of the script
            image_data: Base64 encoded image data
            
        Returns:
            Filename of the saved template
        """
        # Ensure templates directory exists
        templates_dir = self._get_templates_path(script_name)
        os.makedirs(templates_dir, exist_ok=True)
        
        # Decode base64
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        
        try:
            img_bytes = base64.b64decode(image_data)
            # Convert to numpy array using vision module
            image = vision.bytes_to_image(img_bytes)
            
            # Clean the template (inpainting the holes)
            # This makes the template look solid to the user while keeping the mask
            image = vision.clean_template_inpainting(image)
        except Exception as e:
            raise ValueError(f"Invalid image data: {str(e)}")
        
        # Use simple sequential naming: template.png, template_1.png, template_2.png, etc.
        # This is more reliable than OCR-based naming
        base_name = "template"
            
        # Find unique filename
        filename = f"{base_name}.png"
        counter = 1
        while os.path.exists(os.path.join(templates_dir, filename)):
            filename = f"{base_name}_{counter}.png"
            counter += 1
            
        # Save file
        save_path = os.path.join(templates_dir, filename)
        vision.save_screenshot(image, save_path)
        
        return filename

    async def eject_to_code(self, name: str) -> Optional[str]:
        """Convert a script's visual steps to Python code."""
        script = await self.get_script(name)
        if not script:
            return None
        
        code = self.generate_code(script)
        
        # Save the code
        script.code = code
        script.metadata.is_ejected = True
        script.metadata.updated_at = datetime.utcnow()
        
        # Save Python file
        code_path = self._get_code_path(name)
        async with aiofiles.open(code_path, 'w') as f:
            await f.write(code)
        
        # Update metadata
        await self._save_script(script)
        
        return code


# Global service instance
script_service = ScriptService()
