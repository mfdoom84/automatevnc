"""
AutoVNC Client Module

High-level VNC client wrapper providing intuitive automation API
with support for image template matching and OCR.
"""

import os
import time
from typing import Optional, Tuple, Union, List
import numpy as np

from vncdotool import api as vnc_api
from PIL import Image
import io

from .vision import (
    find_template,
    find_template_center,
    extract_text,
    find_text,
    wait_until,
    load_template,
    save_screenshot,
    image_to_bytes,
    bytes_to_image
)
from .keys import Keys


class VNCClient:
    """
    High-level VNC client for automation.
    
    Provides intuitive methods for clicking, typing, and waiting
    with support for coordinate-based and image-based operations.
    """
    
    def __init__(
        self,
        host: str,
        port: int = 5900,
        password: Optional[str] = None,
        templates_dir: Optional[str] = None
    ):
        """
        Initialize VNC client.
        
        Args:
            host: VNC server hostname or IP
            port: VNC server port (default 5900)
            password: VNC password (optional)
            templates_dir: Directory containing image templates
        """
        self.host = host
        self.port = port
        self.password = password
        self.templates_dir = templates_dir or "/data/templates"
        self._client = None
        self._screen_cache = None
        self._screen_cache_time = 0
        self._cache_ttl = 0.1  # Cache screenshots for 100ms
        
    def connect(self) -> "VNCClient":
        """
        Connect to the VNC server.
        
        Returns:
            Self for method chaining
        """
        connection_string = f"{self.host}::{self.port}"
        self._client = vnc_api.connect(
            connection_string,
            password=self.password
        )
        # Wait a moment for connection to stabilize
        time.sleep(0.5)
        return self
        
    def disconnect(self) -> None:
        """Disconnect from the VNC server."""
        if self._client:
            self._client.disconnect()
            self._client = None
            
    def __enter__(self) -> "VNCClient":
        """Context manager entry."""
        return self.connect()
        
    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        """Context manager exit."""
        self.disconnect()
        
    def _ensure_connected(self) -> None:
        """Ensure the client is connected."""
        if not self._client:
            raise RuntimeError("Not connected to VNC server. Call connect() first.")
    
    def _resolve_template(self, template: str) -> np.ndarray:
        """
        Resolve a template name or path to an image array.
        
        Args:
            template: Template filename or full path
            
        Returns:
            Template image as numpy array
        """
        # Check if it's a full path
        if os.path.isabs(template):
            return load_template(template)
        
        # Check in templates directory
        template_path = os.path.join(self.templates_dir, template)
        if os.path.exists(template_path):
            return load_template(template_path)
        
        # Check if file exists as-is
        if os.path.exists(template):
            return load_template(template)
            
        raise FileNotFoundError(f"Template not found: {template}")
    
    def screenshot(self, refresh: bool = False) -> np.ndarray:
        """
        Capture the current screen.
        
        Args:
            refresh: Force refresh even if cached
            
        Returns:
            Screen image as numpy array (BGR format)
        """
        self._ensure_connected()
        
        # Return cached screenshot if fresh enough
        current_time = time.time()
        if not refresh and self._screen_cache is not None:
            if current_time - self._screen_cache_time < self._cache_ttl:
                return self._screen_cache
        
        # Capture new screenshot
        start = time.time()
        self._client.refreshScreen()
        screen = self._client.screen
        
        # Convert PIL Image to numpy array
        if isinstance(screen, Image.Image):
            rgb_array = np.array(screen)
            # Convert RGB to BGR for OpenCV compatibility
            if len(rgb_array.shape) == 3 and rgb_array.shape[2] >= 3:
                import cv2
                bgr_array = cv2.cvtColor(rgb_array, cv2.COLOR_RGB2BGR)
                self._screen_cache = bgr_array
            else:
                self._screen_cache = rgb_array
        else:
            self._screen_cache = screen
            
        self._screen_cache_time = current_time
        # Log capture latency to help diagnose VNC refresh slowness
        try:
            elapsed = (time.time() - start) * 1000.0
            print(f"[Runner] screenshot elapsed={elapsed:.1f}ms refresh={refresh}")
        except Exception:
            pass
        return self._screen_cache
    
    def save_screenshot(self, path: str) -> str:
        """
        Save a screenshot to file.
        
        Args:
            path: Path to save the screenshot
            
        Returns:
            The path where the screenshot was saved
        """
        screen = self.screenshot(refresh=True)
        save_screenshot(screen, path)
        return path
    
    def click(
        self,
        x_or_template: Union[int, str],
        y: Optional[int] = None,
        button: int = 1,
        clicks: int = 1,
        threshold: float = 0.8,
        hint: Optional[Tuple[int, int]] = None
    ) -> bool:
        """
        Click at coordinates or on an image template.
        
        Args:
            x_or_template: X coordinate (int) or template image path (str)
            y: Y coordinate (required if x_or_template is int)
            button: Mouse button (1=left, 2=middle, 3=right)
            clicks: Number of clicks
            
        Returns:
            True if click was performed, False if template not found
        """
        self._ensure_connected()
        
        if isinstance(x_or_template, str):
            # Template-based click
            template = self._resolve_template(x_or_template)
            screen = self.screenshot(refresh=True)
            center = find_template_center(screen, template, threshold=threshold, hint=hint)
            
            if center is None:
                return False
                
            click_x, click_y = center
        else:
            # Coordinate-based click
            if y is None:
                raise ValueError("Y coordinate is required for coordinate-based click")
            click_x, click_y = x_or_template, y
        
        # Perform the click(s)
        for _ in range(clicks):
            self._client.mouseMove(click_x, click_y)
            time.sleep(0.05)
            self._client.mousePress(button)
            time.sleep(0.05)
            
        # Invalidate screen cache
        self._screen_cache = None
        
        return True
    
    def double_click(
        self,
        x_or_template: Union[int, str],
        y: Optional[int] = None,
        button: int = 1
    ) -> bool:
        """
        Double-click at coordinates or on an image template.
        
        Args:
            x_or_template: X coordinate or template image path
            y: Y coordinate (if using coordinates)
            button: Mouse button
            
        Returns:
            True if click was performed
        """
        return self.click(x_or_template, y, button, clicks=2)
    
    def right_click(
        self,
        x_or_template: Union[int, str],
        y: Optional[int] = None
    ) -> bool:
        """
        Right-click at coordinates or on an image template.
        
        Args:
            x_or_template: X coordinate or template image path
            y: Y coordinate (if using coordinates)
            
        Returns:
            True if click was performed
        """
        return self.click(x_or_template, y, button=3)
    
    def move(self, x: int, y: int) -> "VNCClient":
        """
        Move mouse to coordinates.
        
        Args:
            x: X coordinate
            y: Y coordinate
            
        Returns:
            Self for method chaining
        """
        self._ensure_connected()
        self._client.mouseMove(x, y)
        return self
    
    def drag(
        self,
        start_x: int,
        start_y: int,
        end_x: int,
        end_y: int,
        button: int = 1,
        duration: float = 0.5
    ) -> "VNCClient":
        """
        Drag from one point to another.
        
        Args:
            start_x: Starting X coordinate
            start_y: Starting Y coordinate
            end_x: Ending X coordinate
            end_y: Ending Y coordinate
            button: Mouse button to use
            duration: Duration of drag in seconds
            
        Returns:
            Self for method chaining
        """
        self._ensure_connected()
        
        # Move to start position
        self._client.mouseMove(start_x, start_y)
        time.sleep(0.05)
        
        # Press button
        self._client.mouseDown(button)
        
        # Interpolate movement
        steps = int(duration / 0.02)  # 50 FPS
        for i in range(steps + 1):
            t = i / steps
            x = int(start_x + (end_x - start_x) * t)
            y = int(start_y + (end_y - start_y) * t)
            self._client.mouseMove(x, y)
            time.sleep(0.02)
        
        # Release button
        self._client.mouseUp(button)
        
        # Invalidate screen cache
        self._screen_cache = None
        
        return self
    
    def type(
        self,
        text: str,
        keys: Optional[List[str]] = None,
        interval: float = 0.02
    ) -> "VNCClient":
        """
        Type text with optional modifier keys.
        
        Args:
            text: Text to type
            keys: Optional list of keys to press after typing (e.g., [Keys.ENTER])
            interval: Delay between keystrokes
            
        Returns:
            Self for method chaining
        """
        self._ensure_connected()
        
        # Type each character
        for char in text:
            self._client.keyPress(char)
            time.sleep(interval)
        
        # Press additional keys
        if keys:
            for key in keys:
                self._client.keyPress(key)
                time.sleep(interval)
        
        # Invalidate screen cache
        self._screen_cache = None
        
        return self
    
    def press(self, *keys: str) -> "VNCClient":
        """
        Press one or more keys.
        
        Args:
            *keys: Keys to press (use Keys constants)
            
        Returns:
            Self for method chaining
        """
        self._ensure_connected()
        
        for key in keys:
            self._client.keyPress(key)
            time.sleep(0.05)
        
        # Invalidate screen cache
        self._screen_cache = None
        
        return self
    
    def key_combo(self, *keys: str) -> "VNCClient":
        """
        Press a key combination (e.g., Ctrl+C).
        
        Args:
            *keys: Keys to press simultaneously
            
        Returns:
            Self for method chaining
        """
        self._ensure_connected()
        
        # Press all keys down
        for key in keys:
            self._client.keyDown(key)
            time.sleep(0.02)
        
        # Release all keys in reverse order
        for key in reversed(keys):
            self._client.keyUp(key)
            time.sleep(0.02)
        
        # Invalidate screen cache
        self._screen_cache = None
        
        return self
    
    def exists(
        self,
        template: str,
        threshold: float = 0.8,
        region: Optional[Tuple[int, int, int, int]] = None,
        hint: Optional[Tuple[int, int]] = None
    ) -> bool:
        """
        Check if an image template exists on screen.
        
        Args:
            template: Template image path
            threshold: Match confidence threshold
            region: Optional ROI (x, y, width, height)
            
        Returns:
            True if template is found
        """
        self._ensure_connected()
        
        template_img = self._resolve_template(template)
        screen = self.screenshot(refresh=True)

        result = find_template(screen, template_img, threshold, region, hint)
        return result is not None
    
    def find(
        self,
        template: str,
        threshold: float = 0.8,
        region: Optional[Tuple[int, int, int, int]] = None,
        hint: Optional[Tuple[int, int]] = None
    ) -> Optional[Tuple[int, int, int, int]]:
        """
        Find an image template on screen.
        
        Args:
            template: Template image path
            threshold: Match confidence threshold
            region: Optional ROI
            
        Returns:
            Tuple (x, y, width, height) if found, None otherwise
        """
        self._ensure_connected()
        
        template_img = self._resolve_template(template)
        screen = self.screenshot(refresh=True)

        return find_template(screen, template_img, threshold, region, hint)
    
    def wait_for_image(
        self,
        template: str,
        timeout: float = 30.0,
        threshold: float = 0.8,
        region: Optional[Tuple[int, int, int, int]] = None,
        poll_interval: float = 0.5,
        hint: Optional[Tuple[int, int]] = None
    ) -> bool:
        """
        Wait for an image template to appear on screen.
        
        Args:
            template: Template image path
            timeout: Maximum wait time in seconds
            threshold: Match confidence threshold
            region: Optional ROI
            poll_interval: Time between checks
            
        Returns:
            True if template appeared, False if timeout
        """
        self._ensure_connected()
        
        template_img = self._resolve_template(template)

        start_time = time.time()
        last_refresh = 0.0
        refresh_interval = max(poll_interval, 0.5)

        while time.time() - start_time < timeout:
            now = time.time()
            # Refresh screen at most once per refresh_interval to avoid excessive VNC round-trips
            if last_refresh == 0.0 or (now - last_refresh) >= refresh_interval:
                screen = self.screenshot(refresh=True)
                last_refresh = now
            else:
                screen = self.screenshot(refresh=False)

            if find_template(screen, template_img, threshold, region, hint) is not None:
                return True

            time.sleep(poll_interval)

        return False
    
    def get_text(
        self,
        region: Optional[Tuple[int, int, int, int]] = None,
        lang: str = "eng"
    ) -> str:
        """
        Extract text from screen using OCR.
        
        Args:
            region: Optional ROI (x, y, width, height)
            lang: Tesseract language code
            
        Returns:
            Extracted text
        """
        self._ensure_connected()
        
        screen = self.screenshot(refresh=True)
        return extract_text(screen, region, lang)
    
    def text_exists(
        self,
        text: str,
        region: Optional[Tuple[int, int, int, int]] = None,
        lang: str = "eng",
        case_sensitive: bool = False
    ) -> bool:
        """
        Check if specific text exists on screen.
        
        Args:
            text: Text to search for
            region: Optional ROI
            lang: Tesseract language code
            case_sensitive: Whether to match case
            
        Returns:
            True if text is found
        """
        self._ensure_connected()
        
        screen = self.screenshot(refresh=True)
        return find_text(screen, text, region, lang, case_sensitive)
    
    def wait_for_text(
        self,
        text: str,
        timeout: float = 30.0,
        region: Optional[Tuple[int, int, int, int]] = None,
        lang: str = "eng",
        case_sensitive: bool = False,
        poll_interval: float = 0.5
    ) -> bool:
        """
        Wait for specific text to appear on screen.
        
        Args:
            text: Text to wait for
            timeout: Maximum wait time in seconds
            region: Optional ROI
            lang: Tesseract language code
            case_sensitive: Whether to match case
            poll_interval: Time between checks
            
        Returns:
            True if text appeared, False if timeout
        """
        self._ensure_connected()
        
        def check():
            screen = self.screenshot(refresh=True)
            return find_text(screen, text, region, lang, case_sensitive)
        
        return wait_until(check, timeout, poll_interval)
    
    def wait(self, seconds: float) -> "VNCClient":
        """
        Wait for a specified duration.
        
        Args:
            seconds: Time to wait
            
        Returns:
            Self for method chaining
        """
        time.sleep(seconds)
        return self
    
    @property
    def screen_size(self) -> Tuple[int, int]:
        """
        Get the screen dimensions.
        
        Returns:
            Tuple of (width, height)
        """
        self._ensure_connected()
        screen = self.screenshot()
        return (screen.shape[1], screen.shape[0])
