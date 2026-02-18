"""
AutoVNC Data Models

Pydantic models for scripts, steps, runs, and API requests/responses.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


# =============================================================================
# Step Models
# =============================================================================

class StepType(str, Enum):
    """Types of automation steps."""
    CLICK = "click"
    DOUBLE_CLICK = "double_click"
    RIGHT_CLICK = "right_click"
    TYPE = "type"
    KEY_PRESS = "key_press"
    KEY_COMBO = "key_combo"
    WAIT_FOR_IMAGE = "wait_for_image"
    WAIT_FOR_TEXT = "wait_for_text"
    WAIT = "wait"
    SCREENSHOT = "screenshot"
    DRAG = "drag"
    SCROLL = "scroll"
    MOVE = "move"


class Region(BaseModel):
    """Region of interest for vision operations."""
    x: int
    y: int
    width: int
    height: int


class Step(BaseModel):
    """A single automation step."""
    id: str
    type: StepType
    order: int
    
    # Click/drag coordinates
    x: Optional[int] = None
    y: Optional[int] = None
    end_x: Optional[int] = None  # For drag
    end_y: Optional[int] = None  # For drag
    
    # Template matching
    template: Optional[str] = None
    threshold: Optional[float] = 0.8
    
    # Text input
    text: Optional[str] = None
    keys: Optional[List[str]] = None
    
    # Wait parameters
    timeout: Optional[float] = 30.0
    region: Optional[Region] = None
    case_sensitive: Optional[bool] = False

    # Scroll parameters
    direction: Optional[str] = None
    clicks: Optional[int] = None


    # Duration for waits and drags
    duration: Optional[float] = None
    
    # Recording timing: seconds to wait before this action
    delay_before: Optional[float] = None
    
    # Description for UI display
    description: Optional[str] = None


# =============================================================================
# Script Models
# =============================================================================

class CodeMetadata(BaseModel):
    """Metadata about code generation from steps."""
    generated_line_count: int = 0
    generated_code_hash: Optional[str] = None
    last_generated_at: Optional[datetime] = None


class ScriptMetadata(BaseModel):
    """Script metadata."""
    name: str
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    is_ejected: bool = False  # True if converted to code


class Script(BaseModel):
    """Complete script with steps and code."""
    metadata: ScriptMetadata
    steps: List[Step] = []
    code: Optional[str] = None
    code_metadata: Optional[CodeMetadata] = None
    templates: List[str] = []


class ScriptListItem(BaseModel):
    """Script summary for list views."""
    name: str
    description: Optional[str] = None
    step_count: int
    is_ejected: bool
    created_at: datetime
    updated_at: datetime


class CreateScriptRequest(BaseModel):
    """Request to create a new script."""
    name: str
    description: Optional[str] = None
    steps: List[Step] = []


class UpdateScriptRequest(BaseModel):
    """Request to update an existing script."""
    name: Optional[str] = None
    description: Optional[str] = None
    steps: Optional[List[Step]] = None
    code: Optional[str] = None
    code_metadata: Optional[CodeMetadata] = None


class EjectScriptResponse(BaseModel):
    """Response after ejecting script to code."""
    code: str
    message: str


# =============================================================================
# Run Models
# =============================================================================

class RunStatus(str, Enum):
    """Status of a script run."""
    QUEUED = "queued"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"


class VNCCredentials(BaseModel):
    """VNC connection credentials."""
    host: str
    port: int = 5900
    password: Optional[str] = None


class RunScriptRequest(BaseModel):
    """Request to run a script."""
    vnc: VNCCredentials
    variables: Optional[Dict[str, Any]] = None
    chain: Optional[List[str]] = None  # Additional scripts to chain


class Run(BaseModel):
    """A script execution run."""
    id: str
    script_name: str
    status: RunStatus
    vnc_host: str
    vnc_port: int
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    exit_code: Optional[int] = None
    error_message: Optional[str] = None
    log_file: Optional[str] = None
    failure_screenshot: Optional[str] = None


class RunStatusResponse(BaseModel):
    """Response for run status query."""
    id: str
    status: RunStatus
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    exit_code: Optional[int] = None
    error_message: Optional[str] = None


class RunLogsResponse(BaseModel):
    """Response for run logs query."""
    id: str
    logs: str
    is_complete: bool
    status: Optional[RunStatus] = None


# =============================================================================
# AI Models
# =============================================================================

class AIProvider(str, Enum):
    """Supported AI providers."""
    OPENAI = "openai"
    GITHUB = "github"


class AISuggestRequest(BaseModel):
    """Request for AI robustness suggestions."""
    code: str
    mode: str = "visual"  # "visual" | "code"
    screen_text: Optional[List[str]] = None  # OCR text from screen
    highlighted_lines: Optional[List[int]] = None
    instructions: Optional[str] = None


class AISuggestResponse(BaseModel):
    """Response with AI suggestions."""
    suggestions: List[Dict[str, Any]]
    improved_code: Optional[str] = None


class AIGenerateRequest(BaseModel):
    """Request for AI code generation."""
    prompt: str
    current_code: Optional[str] = None
    screen_text: Optional[List[str]] = None


class AIGenerateResponse(BaseModel):
    """Response with generated code."""
    code: str
    explanation: str


class AIAnalyzeFailureRequest(BaseModel):
    """Request to analyze a failure."""
    run_id: str
    code: str


class AIAnalyzeFailureResponse(BaseModel):
    """Response with failure analysis."""
    analysis: str
    suggested_fix: Optional[str] = None


# =============================================================================
# Settings Models
# =============================================================================

class SettingsResponse(BaseModel):
    """Current settings (with masked keys)."""
    ai_provider: str
    openai_key_configured: bool
    github_key_configured: bool


class UpdateSettingsRequest(BaseModel):
    """Request to update settings."""
    ai_provider: Optional[str] = None
    openai_api_key: Optional[str] = None
    github_models_api_key: Optional[str] = None


# =============================================================================
# Template Models
# =============================================================================

class TemplateInfo(BaseModel):
    """Information about an image template."""
    name: str
    script_name: str
    width: int
    height: int
    created_at: datetime


class CaptureTemplateRequest(BaseModel):
    """Request to capture a template from screen."""
    name: str
    script_name: str
    region: Region
