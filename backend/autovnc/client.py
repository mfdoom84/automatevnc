"""
AutoVNC Client Module

High-level VNC client wrapper providing intuitive automation API
with support for image template matching and OCR.
"""

import os
import time
from datetime import datetime
from typing import Optional, Tuple, Union, List, Callable
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
        templates_dir: Optional[str] = None,
        logger: Optional[Callable[[str], None]] = None,
        threshold: float = 0.7
    ):
        """
        Initialize VNC client.
        
        Args:
            host: VNC server hostname or IP
            port: VNC server port (default 5900)
            password: VNC password (optional)
            templates_dir: Directory containing image templates
            logger: Optional logging function
            threshold: Default match confidence threshold (0.0 to 1.0)
        """
        self.host = host
        self.port = port
        self.password = password
        self.templates_dir = templates_dir or "/data/templates"
        self.logger = logger
        self.threshold = threshold
        self._client = None
        self._screen_cache = None
        self._screen_cache_time = 0
        self._cache_ttl = 0.1  # Cache screenshots for 100ms
        self._last_found_center = None  # Store center from wait_for_image to use as hint for next click
        self._last_mouse_pos = (10, 10) # Track last known mouse position
        self._last_wiggle_time = 0
        
    def log(self, message: str) -> None:
        """Log a message via the provided logger or print."""
        if self.logger:
            self.logger(message)
        else:
            timestamp = datetime.utcnow().strftime("%H:%M:%S.%f")[:-3]
            print(f"[{timestamp}] [VNC] {message}")

    def connect(self) -> "VNCClient":
        """
        Connect to the VNC server.
        
        Returns:
            Self for method chaining
        """
        self.log(f"Connecting to {self.host}:{self.port}...")
        connection_string = f"{self.host}::{self.port}"
        self._client = vnc_api.connect(
            connection_string,
            password=self.password
        )
        # Wait a moment for connection to stabilize
        time.sleep(1.0) # Increased to 1.0s
        self.log("Connected to VNC server.")
        return self
        
    def disconnect(self, quiet: bool = False) -> None:
        """Disconnect from the VNC server."""
        if self._client:
            if not quiet:
                self.log("Disconnecting from VNC server...")
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
            
    def _ensure_screen_refresh(self, force_full: bool = True) -> None:
        """
        Request a screen update from the server.
        Uses non-incremental update by default to prevent 'stuck' states.
        
        Args:
            force_full: If True, request full framebuffer update (incremental=False).
                        If False, request incremental update (faster but riskier).
        """
        try:
            # Force full refresh ensures we get an update even if only cursor changed
            # or if server is ignoring incremental requests due to idleness.
            self._client.refreshScreen(incremental=not force_full)
        except TypeError:
            # Fallback for older vncdotool versions that don't support incremental arg
            self._client.refreshScreen()
        except Exception as e:
            # catch-all for connection issues during refresh
            self.log(f"Warning: Screen refresh failed: {e}")
    
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
            if os.path.exists(template):
                return load_template(template)
            raise FileNotFoundError(f"Template path not found: {template}")
        
        # Check in templates directory
        template_path = os.path.join(self.templates_dir, template)
        if os.path.exists(template_path):
            return load_template(template_path)
        
        # Check if file exists as-is (relative to CWD)
        if os.path.exists(template):
            return load_template(template)
            
        raise FileNotFoundError(
            f"Template '{template}' not found. \n"
            f"Searched in: \n"
            f"  - {template_path} \n"
            f"  - {os.path.abspath(template)}"
        )
    
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
        if refresh:
            self._ensure_screen_refresh(force_full=True)
        else:
            self._ensure_screen_refresh(force_full=False)
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
        # Log capture latency for backend (in-process) so we can see VNC refresh cost
        try:
            elapsed = (time.time() - start) * 1000.0
            print(f"[Backend] screenshot elapsed={elapsed:.1f}ms refresh={refresh}")
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
        self.log(f"Saving screenshot to {path}...")
        screen = self.screenshot(refresh=True)
        save_screenshot(screen, path)
        return path
    
    def click(
        self,
        x_or_template: Union[int, str],
        y: Optional[int] = None,
        button: int = 1,
        clicks: int = 1,
        threshold: Optional[float] = None,
        timeout: float = 0.0,
        hint: Optional[Tuple[int, int]] = None
    ) -> bool:
        """
        Click at coordinates or on an image template.
        
        Args:
            x_or_template: X coordinate (int) or template image path (str)
            y: Y coordinate (required if x_or_template is int)
            button: Mouse button (1=left, 2=middle, 3=right)
            clicks: Number of clicks
            threshold: Match confidence threshold (uses default if None)
            
        Returns:
            True if click was performed, False if template not found
        """
        self._ensure_connected()
        
        if isinstance(x_or_template, str):
            # Template-based click
            current_threshold = threshold if threshold is not None else self.threshold
            
            if timeout > 0:
                found = self.wait_for_image(x_or_template, timeout=timeout, threshold=current_threshold, fail_on_timeout=True, hint=hint)
                if not found: return False
            
            click_x, click_y = self._last_found_center

            # ULTRA-SIMPLIFIED CLICK: Trust wait_for_image and click IMMEDIATELY.
            # This avoids the redundant refreshes that cause VNC server hangs.
            click_x, click_y = self._last_found_center
            self.log(f"Clicking template '{x_or_template}' at ({click_x}, {click_y})")
        else:
            # Coordinate-based click
            if y is None:
                raise ValueError("Y coordinate is required for coordinate-based click")
            click_x, click_y = x_or_template, y
            self.log(f"Clicking at ({click_x}, {click_y})")
        
        # Perform the click(s) INSTANTLY
        self._last_mouse_pos = (click_x, click_y)
        for i in range(clicks):
            self._client.mouseMove(click_x, click_y)
            # No stabilization sleep - click immediately
            self._client.mouseDown(button)
            time.sleep(0.05) # Tiny tap duration
            self._client.mouseUp(button)
            if clicks > 1: time.sleep(0.1) # Short gap for double clicks
            
        # Invalidate screen cache
        self._screen_cache = None
        return True
    
    def double_click(
        self,
        x_or_template: Union[int, str],
        y: Optional[int] = None,
        button: int = 1,
        timeout: float = 0.0,
        hint: Optional[Tuple[int, int]] = None
    ) -> bool:
        """
        Double-click at coordinates or on an image template.
        
        Args:
            x_or_template: X coordinate or template image path
            y: Y coordinate (if using coordinates)
            button: Mouse button
            timeout: Timeout for template matching (seconds)
            
        Returns:
            True if click was performed
        """
        return self.click(x_or_template, y, button, clicks=2, timeout=timeout, hint=hint)
    
    def right_click(
        self,
        x_or_template: Union[int, str],
        y: Optional[int] = None,
        timeout: float = 0.0,
        hint: Optional[Tuple[int, int]] = None
    ) -> bool:
        """
        Right-click at coordinates or on an image template.
        
        Args:
            x_or_template: X coordinate or template image path
            y: Y coordinate (if using coordinates)
            timeout: Timeout for template matching (seconds)
            
        Returns:
            True if click was performed
        """
        return self.click(x_or_template, y, button=3, timeout=timeout, hint=hint)
    
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
        self._last_mouse_pos = (x, y)
        return self
    
    def drag(
        self,
        start_x: int,
        start_y: int,
        end_x: int,
        end_y: int,
        button: int = 1,
        duration: float = 1.5
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
    
    def scroll(
        self,
        direction: str,
        clicks: int = 1,
        x: Optional[int] = None,
        y: Optional[int] = None
    ) -> "VNCClient":
        """
        Scroll the mouse wheel.
        
        Args:
            direction: 'up' or 'down'
            clicks: Number of scroll ticks
            x: Optional X coordinate to move to before scrolling
            y: Optional Y coordinate to move to before scrolling
            
        Returns:
            Self for method chaining
        """
        self._ensure_connected()
        
        if x is not None and y is not None:
            self.move(x, y)
        
        # VNC uses buttons 4 (Up) and 5 (Down) for scrolling
        button = 4 if direction.lower() == 'up' else 5
        
        self.log(f"Scrolling {direction} ({clicks} clicks)")
        for _ in range(clicks):
            self._client.mousePress(button)
            time.sleep(0.05)
            
        # Invalidate screen cache
        self._screen_cache = None
        
        return self

    def type(
        self,
        text: str,
        keys: Optional[List[str]] = None,
        interval: float = 0.1
    ) -> "VNCClient":
        """
        Type text with optional modifier keys.
        
        Args:
            text: Text to type
            keys: Optional list of keys to press after typing (e.g., [Keys.ENTER])
            interval: Delay between keystrokes (default 0.1s for stability)
            
        Returns:
            Self for method chaining
        """
        self._ensure_connected()
        self.log(f"Typing text: '{text}'" + (f" with keys {keys}" if keys else ""))
        
        # Type each character
        for char in text:
            self._client.keyPress(char)
            time.sleep(interval)
        
        # Press additional keys
        if keys:
            for key in keys:
                self._client.keyPress(key)
                time.sleep(interval)
        
        # Post-type stabilization delay
        time.sleep(0.5)
        
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
        self.log(f"Pressing keys: {keys}")
        
        for key in keys:
            self._client.keyPress(key)
            time.sleep(0.1)  # Increased from 0.05s for stability
        
        # Post-press stabilization delay
        time.sleep(0.5)
        
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
        self.log(f"Pressing key combo: {'+'.join(keys)}")
        
        # Press all keys down
        for key in keys:
            self._client.keyDown(key)
            time.sleep(0.05)
        
        # Release all keys in reverse order
        for key in reversed(keys):
            self._client.keyUp(key)
            time.sleep(0.05)
        
        # Post-combo stabilization delay
        time.sleep(0.5)
        
        # Invalidate screen cache
        self._screen_cache = None
        
        return self
    
    def exists(
        self,
        template_name: str,
        threshold: Optional[float] = None,
        region: Optional[Tuple[int, int, int, int]] = None,
        hint: Optional[Tuple[int, int]] = None
    ) -> bool:
        """
        Check if an image template exists on screen.
        
        Args:
            template_name: Template filename or path
            threshold: Match confidence threshold (default if None)
            region: Optional ROI (x, y, width, height)
            
        Returns:
            True if template is found
        """
        return self.find(template_name, threshold, region, hint) is not None
    
    def find(
        self,
        template_name: str,
        threshold: Optional[float] = None,
        region: Optional[Tuple[int, int, int, int]] = None,
        hint: Optional[Tuple[int, int]] = None
    ) -> Optional[Tuple[int, int, int, int]]:
        """
        Find an image template on screen.
        
        Args:
            template_name: Template filename or path
            threshold: Match confidence threshold (default if None)
            region: Optional ROI
            
        Returns:
            Tuple (x, y, width, height) if found, None otherwise
        """
        self._ensure_connected()
        template = self._resolve_template(template_name)
        # OPTIMIZATION: Use refresh=False to allow incremental/cached screenshots
        # instead of forcing a full refresh every time we check for an image.
        screen = self.screenshot(refresh=False)
        
        current_threshold = threshold if threshold is not None else self.threshold
        return find_template(screen, template, threshold=current_threshold, region=region, hint=hint)
    
    def find_template(self, *args, **kwargs):
        """Alias for find()."""
        return self.find(*args, **kwargs)
    
    def wait_for_image(
        self,
        template_name: str,
        timeout: float = 30.0,
        threshold: Optional[float] = None,
        region: Optional[Tuple[int, int, int, int]] = None,
        poll_interval: float = 0.5,
        fail_on_timeout: bool = True,
        hint: Optional[Tuple[int, int]] = None
    ) -> bool:
        """
        Wait for an image template to appear on screen.
        
        Args:
            template_name: Template filename or path
            timeout: Maximum wait time in seconds
            threshold: Match confidence threshold
            region: Optional ROI
            poll_interval: Time between checks
            fail_on_timeout: Raise RuntimeError if timeout reached
            
        Returns:
            True if template appeared, False if timeout (and fail_on_timeout=False)
        """
        self.log(f"Searching for image '{template_name}' (timeout: {timeout}s)...")

        start_time = time.time()
        attempt = 0
        while time.time() - start_time < timeout:
            attempt += 1
            
            
            try:
                # Use find() to check for the template
                match = self.find(template_name, threshold, region, hint)
                found = match is not None
                if found:
                    # Store center for use as hint in next click() call
                    # match is (x, y, w, h) - compute center
                    x, y, w, h = match
                    self._last_found_center = (x + w // 2, y + h // 2)
            except Exception as e:
                self.log(f"Error checking for image '{template_name}' (attempt {attempt}): {e}")
                found = False

            elapsed = time.time() - start_time
            if found:
                self.log(f"Found image '{template_name}' at {self._last_found_center} in {elapsed:.2f}s")

            if found:
                return True

            time.sleep(poll_interval)

        if fail_on_timeout:
            error_msg = f"Timeout waiting for image '{template_name}' after {timeout}s"
            self.log(error_msg)
            raise RuntimeError(error_msg)

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
        case_sensitive: bool = False,
        hint: Optional[Tuple[int, int]] = None,
        similarity_threshold: float = 0.7
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
        return find_text(screen, text, region, lang, case_sensitive, hint, similarity_threshold)
    
    def wait_for_text(
        self,
        text: str,
        timeout: float = 30.0,
        region: Optional[Tuple[int, int, int, int]] = None,
        lang: str = "eng",
        case_sensitive: bool = False,
        poll_interval: float = 0.5,
        hint: Optional[Tuple[int, int]] = None,
        similarity_threshold: float = 0.7
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
        self.log(f"Waiting for text '{text}' (timeout: {timeout}s, region: {region})...")
        
        start_time = time.time()
        attempt = 0
        while time.time() - start_time < timeout:
            attempt += 1
            
            try:
                screen = self.screenshot(refresh=True)
                found = find_text(screen, text, region, lang, case_sensitive, hint, similarity_threshold)
                elapsed = time.time() - start_time
                if found:
                    self.log(f"[wait_for_text] Text '{text}' found after {elapsed:.2f}s (attempt {attempt})")
                    return True
                else:
                    # Log extracted text on first few attempts for debugging
                    if attempt <= 3:
                        extracted = extract_text(screen, region, lang)
                        self.log(f"[wait_for_text] attempt={attempt} elapsed={elapsed:.2f}s found=False extracted='{extracted[:80]}'")
                    else:
                        self.log(f"[wait_for_text] attempt={attempt} elapsed={elapsed:.2f}s found=False")
            except Exception as e:
                elapsed = time.time() - start_time
                self.log(f"[wait_for_text] attempt={attempt} elapsed={elapsed:.2f}s error={e}")
            
            time.sleep(poll_interval)
        
        self.log(f"[wait_for_text] Timeout after {timeout}s waiting for text '{text}'")
        return False
    def wait(self, seconds: float) -> "VNCClient":
        """
        Wait for a specified duration.
        
        Args:
            seconds: Time to wait
            
        Returns:
            Self for method chaining
        """
        self.log(f"Waiting for {seconds}s...")
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
