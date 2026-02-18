"""
AutoVNC - High-level VNC automation library

This library provides a simple, intuitive API for automating VNC-based
workflows, including image template matching, OCR, and smart waits.
"""

from .client import VNCClient
from .keys import Keys
from .context import ExecutionContext
from .vision import find_template, extract_text

__version__ = "1.0.0"
__all__ = ["VNCClient", "Keys", "ExecutionContext", "find_template", "extract_text"]
