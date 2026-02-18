"""
AI Service

Provides AI-powered features including robustness suggestions,
code generation, and failure analysis.
"""

import os
from typing import Optional, List, Dict, Any
import httpx

from ..config import settings
from ..models import AIProvider


# AutoVNC library documentation for AI context
AUTOVNC_DOCS = """
# AutoVNC Python Library

## VNCClient Methods

### Click Operations
- `vnc.click(x, y)` - Click at coordinates
- `vnc.click("template.png")` - Click on image match (center)
- `vnc.double_click(x, y)` or `vnc.double_click("template.png")`
- `vnc.right_click(x, y)` or `vnc.right_click("template.png")`

### Keyboard Operations
- `vnc.type("text")` - Type text
- `vnc.type("text", [Keys.ENTER])` - Type text and press keys
- `vnc.press(Keys.ENTER)` - Press a key
- `vnc.key_combo(Keys.CTRL, 'c')` - Press key combination

### Wait Operations (Smart Waits)
- `vnc.wait_for_image("template.png", timeout=30)` - Wait for image to appear
- `vnc.wait_for_image("template.png", timeout=30, region=(x, y, w, h))` - Wait in region
- `vnc.wait_for_text("text", timeout=30)` - Wait for text via OCR
- `vnc.wait_for_text("text", timeout=30, region=(x, y, w, h))` - Wait in region
- `vnc.wait_for_text("text", timeout=30, case_sensitive=False)` - Case-insensitive by default
- `vnc.wait(seconds)` - Static wait (avoid when possible)

### Check Operations
- `vnc.exists("template.png")` - Check if image exists (returns bool)
- `vnc.find("template.png")` - Find image location (returns (x, y, w, h) or None)
- `vnc.text_exists("text")` - Check if text exists via OCR
- `vnc.get_text()` - Get all screen text via OCR
- `vnc.get_text(region=(x, y, w, h))` - Get text in region

### Utility
- `vnc.screenshot()` - Get current screen as numpy array
- `vnc.save_screenshot("path.png")` - Save screenshot to file
- `vnc.screen_size` - Get (width, height) of screen

## Keys Constants
Use `from autovnc import Keys` then:
- Keys.ENTER, Keys.TAB, Keys.ESCAPE, Keys.BACKSPACE, Keys.DELETE
- Keys.UP, Keys.DOWN, Keys.LEFT, Keys.RIGHT
- Keys.CTRL, Keys.ALT, Keys.SHIFT
- Keys.F1 through Keys.F12

## Best Practices
1. Use image-based clicks over coordinate clicks when possible
2. Always use wait_for_image or wait_for_text before interactions
3. Use region parameter to limit OCR/template search area
4. Use timeout parameter to control wait duration
5. Use exists() for conditional logic
"""


class AIService:
    """Service for AI-powered automation assistance."""
    
    def __init__(self):
        self.openai_key = settings.openai_api_key
        self.github_key = settings.github_models_api_key
        self.provider = settings.ai_provider
    
    def _get_client_and_model(self) -> tuple:
        """Get HTTP client configuration for the current provider."""
        if self.provider == "openai" and self.openai_key:
            return (
                "https://api.openai.com/v1/chat/completions",
                {"Authorization": f"Bearer {self.openai_key}"},
                "gpt-4-turbo-preview"
            )
        elif self.provider == "github" and self.github_key:
            return (
                "https://models.inference.ai.azure.com/chat/completions",
                {"Authorization": f"Bearer {self.github_key}"},
                "gpt-4o"
            )
        else:
            raise ValueError("No AI API key configured")
    
    async def _call_ai(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.3
    ) -> str:
        """Make a call to the AI API."""
        url, headers, model = self._get_client_and_model()
        
        headers["Content-Type"] = "application/json"
        
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": temperature,
            "max_tokens": 2000
        }
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            
            data = response.json()
            return data["choices"][0]["message"]["content"]
    
    async def get_robustness_suggestions(
        self,
        code: str,
        mode: str = "visual",
        screen_text: Optional[List[str]] = None,
        highlighted_lines: Optional[List[int]] = None,
        instructions: Optional[str] = None
    ) -> Dict[str, Any]:
        """Analyze code and suggest robustness improvements."""
        
        if mode == "code":
            system_prompt = f"""You are an expert Python developer and automation engineer.
Your job is to perform a code review on an AutoVNC automation script.

{AUTOVNC_DOCS}

Focus on:
1. Pythonic best practices and code readability
2. Error handling and logging
3. Efficient use of the AutoVNC library
4. Logical flow and edge cases

Respond in JSON format:
{{
    "suggestions": [
        {{
            "line": <line_number>,
            "issue": "<detailed review comment>",
            "severity": "high|medium|low",
            "fix": "<suggested code change>"
        }}
    ],
    "improved_code": "<complete refactored code if significant changes needed, or null>"
}}
"""
        else: # visual mode
            system_prompt = f"""You are an expert automation engineer reviewing VNC automation steps generated from a recorder.
Your job is to identify fragile patterns and suggest more robust alternatives.

{AUTOVNC_DOCS}

Focus on:
1. Coordinate-based clicks that should use image matching
2. Missing wait_for_image/wait_for_text before interactions
3. Hardcoded delays that should be smart waits
4. Missing error handling for element not found scenarios

Respond in JSON format:
{{
    "suggestions": [
        {{
            "line": <line_number>,
            "issue": "<description of the problem>",
            "severity": "high|medium|low",
            "fix": "<suggested code fix>"
        }}
    ],
    "improved_code": "<complete improved code if changes needed, or null>"
}}
"""
        
        user_prompt = f"Review this automation script:\n\n```python\n{code}\n```"
        
        if screen_text:
            user_prompt += f"\n\nCurrent screen text (via OCR):\n{', '.join(screen_text)}"
        
        if highlighted_lines:
            user_prompt += f"\n\nUser highlighted lines: {highlighted_lines}"
        
        if instructions:
            user_prompt += f"\n\nUSER SPECIFIC REVIEW INSTRUCTIONS (PRIORITIZE THESE):\n{instructions}"
        
        try:
            response = await self._call_ai(system_prompt, user_prompt)
            
            # Try to parse JSON response
            import json
            # Find JSON in response
            start = response.find('{')
            end = response.rfind('}') + 1
            if start != -1 and end > start:
                return json.loads(response[start:end])
            
            return {
                "suggestions": [{"issue": response, "severity": "low", "fix": None}],
                "improved_code": None
            }
        
        except Exception as e:
            return {
                "suggestions": [{"issue": f"Error getting suggestions: {e}", "severity": "low"}],
                "improved_code": None
            }
    
    async def generate_code(
        self,
        prompt: str,
        current_code: Optional[str] = None,
        screen_text: Optional[List[str]] = None
    ) -> Dict[str, str]:
        """Generate automation code from natural language."""
        system_prompt = f"""You are an expert automation engineer writing VNC automation scripts.
Generate Python code using the autovnc library based on user instructions.

{AUTOVNC_DOCS}

Rules:
1. Use image-based operations when describing UI elements
2. Always include appropriate waits before interactions
3. Add comments explaining each step
4. Use proper error handling where appropriate

Respond in JSON format:
{{
    "code": "<the generated Python code>",
    "explanation": "<brief explanation of what the code does>"
}}
"""
        
        user_prompt = f"Generate code for: {prompt}"
        
        if current_code:
            user_prompt += f"\n\nExisting code to extend/modify:\n```python\n{current_code}\n```"
        
        if screen_text:
            user_prompt += f"\n\nCurrent screen text (via OCR):\n{', '.join(screen_text)}"
        
        try:
            response = await self._call_ai(system_prompt, user_prompt, temperature=0.5)
            
            # Try to parse JSON response
            import json
            start = response.find('{')
            end = response.rfind('}') + 1
            if start != -1 and end > start:
                return json.loads(response[start:end])
            
            # Fallback: extract code from markdown blocks
            if "```python" in response:
                code_start = response.find("```python") + 9
                code_end = response.find("```", code_start)
                code = response[code_start:code_end].strip()
                return {"code": code, "explanation": "Generated code"}
            
            return {"code": response, "explanation": "Generated code"}
        
        except Exception as e:
            return {
                "code": f"# Error: {e}",
                "explanation": f"Failed to generate code: {e}"
            }
    
    async def analyze_failure(
        self,
        code: str,
        error_message: str,
        log_content: Optional[str] = None,
        screenshot_base64: Optional[str] = None
    ) -> Dict[str, str]:
        """Analyze a script failure and suggest fixes."""
        system_prompt = f"""You are an expert automation engineer debugging VNC automation scripts.
Analyze the failure and suggest specific fixes.

{AUTOVNC_DOCS}

Respond in JSON format:
{{
    "analysis": "<detailed analysis of what went wrong>",
    "suggested_fix": "<specific code fix to address the issue>"
}}
"""
        
        user_prompt = f"""The following script failed:

```python
{code}
```

Error message: {error_message}
"""
        
        if log_content:
            user_prompt += f"\n\nExecution log:\n{log_content[:2000]}"
        
        try:
            response = await self._call_ai(system_prompt, user_prompt)
            
            import json
            start = response.find('{')
            end = response.rfind('}') + 1
            if start != -1 and end > start:
                return json.loads(response[start:end])
            
            return {
                "analysis": response,
                "suggested_fix": None
            }
        
        except Exception as e:
            return {
                "analysis": f"Error analyzing failure: {e}",
                "suggested_fix": None
            }
    
    def is_configured(self) -> bool:
        """Check if AI is properly configured."""
        if self.provider == "openai":
            return bool(self.openai_key)
        elif self.provider == "github":
            return bool(self.github_key)
        return False
    
    def update_keys(
        self,
        openai_key: Optional[str] = None,
        github_key: Optional[str] = None,
        provider: Optional[str] = None
    ) -> None:
        """Update API keys."""
        if openai_key is not None:
            self.openai_key = openai_key
        if github_key is not None:
            self.github_key = github_key
        if provider is not None:
            self.provider = provider


# Global service instance
ai_service = AIService()
