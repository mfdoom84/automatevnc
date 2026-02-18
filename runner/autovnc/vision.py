"""
AutoVNC Vision Module

Provides computer vision capabilities using OpenCV for template matching
and Tesseract for OCR text extraction.
"""

import time
from typing import Optional, Tuple, Callable
import cv2
import numpy as np
import pytesseract
from PIL import Image
import io


def find_template(
    screen: np.ndarray,
    template: np.ndarray,
    threshold: float = 0.8,
    region: Optional[Tuple[int, int, int, int]] = None,
    hint: Optional[Tuple[int, int]] = None
) -> Optional[Tuple[int, int, int, int]]:
    """
    Find a template image using two-stage search: local (hint) then global.
    
    Args:
        screen: The screen image as a numpy array (BGR format)
        template: The template image to find as a numpy array (BGR format)
        threshold: Match confidence threshold (0.0 to 1.0), default 0.8
        region: Optional (x, y, width, height) to limit search area
        hint: Optional (center_x, center_y) to prioritize local search area
        
    Returns:
        Tuple of (x, y, width, height) if found, None otherwise.
        The coordinates represent the top-left corner and dimensions of the match.
    """
    def _do_match(screen, template, threshold, search_region):
        """Helper to perform the actual template matching."""
        if search_region:
            x, y, w, h = search_region
            search_area = screen[y:y+h, x:x+w]
            offset_x, offset_y = x, y
        else:
            search_area = screen
            offset_x, offset_y = 0, 0
        
        if len(search_area.shape) == 3:
            search_gray = cv2.cvtColor(search_area, cv2.COLOR_BGR2GRAY)
        else:
            search_gray = search_area
            
        if len(template.shape) == 3:
            template_gray = cv2.cvtColor(template, cv2.COLOR_BGR2GRAY)
        else:
            template_gray = template
        
        template_h, template_w = template_gray.shape[:2]
        
        if template_h > search_gray.shape[0] or template_w > search_gray.shape[1]:
            return None
        
        result = cv2.matchTemplate(search_gray, template_gray, cv2.TM_CCOEFF_NORMED)
        min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(result)
        
        if max_val >= threshold:
            match_x = max_loc[0] + offset_x
            match_y = max_loc[1] + offset_y
            return (match_x, match_y, template_w, template_h)
        return None
    
    # Stage 1: Local search if hint provided and no explicit region
    if hint and not region:
        hint_x, hint_y = hint
        radius = 150  # 300x300 search area
        local_x = max(0, hint_x - radius)
        local_y = max(0, hint_y - radius)
        local_w = min(screen.shape[1] - local_x, radius * 2)
        local_h = min(screen.shape[0] - local_y, radius * 2)
        
        local_region = (local_x, local_y, local_w, local_h)
        match = _do_match(screen, template, threshold, local_region)
        if match:
            return match
    
    # Stage 2: Global (or region-constrained) search
    return _do_match(screen, template, threshold, region)


def find_template_center(
    screen: np.ndarray,
    template: np.ndarray,
    threshold: float = 0.8,
    region: Optional[Tuple[int, int, int, int]] = None,
    hint: Optional[Tuple[int, int]] = None
) -> Optional[Tuple[int, int]]:
    """
    Find the center point of a template match.
    
    Args:
        screen: The screen image as a numpy array
        template: The template image to find
        threshold: Match confidence threshold
        region: Optional ROI to limit search
        hint: Optional (center_x, center_y) to prioritize local search
        
    Returns:
        Tuple of (center_x, center_y) if found, None otherwise
    """
    match = find_template(screen, template, threshold, region, hint)
    if match:
        x, y, w, h = match
        return (x + w // 2, y + h // 2)
    return None


def extract_text(
    image: np.ndarray,
    region: Optional[Tuple[int, int, int, int]] = None,
    lang: str = "eng"
) -> str:
    """
    Extract text from an image using Tesseract OCR.
    
    Args:
        image: The image as a numpy array (BGR format)
        region: Optional (x, y, width, height) to limit OCR area
        lang: Tesseract language code, default "eng"
        
    Returns:
        Extracted text as a string
    """
    # Apply region of interest if specified
    if region:
        x, y, w, h = region
        ocr_area = image[y:y+h, x:x+w]
    else:
        ocr_area = image
    
    # Convert BGR to RGB for PIL
    if len(ocr_area.shape) == 3:
        rgb_image = cv2.cvtColor(ocr_area, cv2.COLOR_BGR2RGB)
    else:
        rgb_image = ocr_area
    
    # Convert to PIL Image
    pil_image = Image.fromarray(rgb_image)
    
    # Perform OCR
    text = pytesseract.image_to_string(pil_image, lang=lang)
    
    return text.strip()


def find_text(
    image: np.ndarray,
    search_text: str,
    region: Optional[Tuple[int, int, int, int]] = None,
    lang: str = "eng",
    case_sensitive: bool = False
) -> bool:
    """
    Check if specific text exists in an image.
    
    Args:
        image: The image as a numpy array
        search_text: The text to search for
        region: Optional ROI to limit search
        lang: Tesseract language code
        case_sensitive: Whether to perform case-sensitive matching
        
    Returns:
        True if text is found, False otherwise
    """
    extracted = extract_text(image, region, lang)
    
    if case_sensitive:
        return search_text in extracted
    else:
        return search_text.lower() in extracted.lower()


def wait_until(
    condition_fn: Callable[[], bool],
    timeout: float = 30.0,
    poll_interval: float = 0.5
) -> bool:
    """
    Wait until a condition function returns True.
    
    Args:
        condition_fn: A callable that returns True when condition is met
        timeout: Maximum time to wait in seconds
        poll_interval: Time between condition checks in seconds
        
    Returns:
        True if condition was met, False if timeout occurred
    """
    start_time = time.time()
    
    while time.time() - start_time < timeout:
        try:
            if condition_fn():
                return True
        except Exception:
            pass  # Ignore errors during polling
        
        time.sleep(poll_interval)
    
    return False


def load_template(path: str) -> np.ndarray:
    """
    Load an image template from file.
    
    Args:
        path: Path to the template image file
        
    Returns:
        Template as numpy array in BGR format
        
    Raises:
        FileNotFoundError: If the template file doesn't exist
        ValueError: If the image couldn't be loaded
    """
    template = cv2.imread(path)
    if template is None:
        raise ValueError(f"Could not load template image: {path}")
    return template


def save_screenshot(image: np.ndarray, path: str) -> None:
    """
    Save an image to file.
    
    Args:
        image: The image as a numpy array (BGR format)
        path: Path to save the image
    """
    cv2.imwrite(path, image)


def image_to_bytes(image: np.ndarray, format: str = "PNG") -> bytes:
    """
    Convert a numpy image to bytes.
    
    Args:
        image: The image as a numpy array
        format: Image format (PNG, JPEG, etc.)
        
    Returns:
        Image data as bytes
    """
    # Convert BGR to RGB
    if len(image.shape) == 3:
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    else:
        rgb_image = image
    
    pil_image = Image.fromarray(rgb_image)
    buffer = io.BytesIO()
    pil_image.save(buffer, format=format)
    return buffer.getvalue()


def bytes_to_image(data: bytes) -> np.ndarray:
    """
    Convert bytes to a numpy image.
    
    Args:
        data: Image data as bytes
        
    Returns:
        Image as numpy array in BGR format
    """
    pil_image = Image.open(io.BytesIO(data))
    rgb_array = np.array(pil_image)
    
    # Convert RGB to BGR for OpenCV
    if len(rgb_array.shape) == 3 and rgb_array.shape[2] >= 3:
        bgr_array = cv2.cvtColor(rgb_array, cv2.COLOR_RGB2BGR)
        return bgr_array
    
    return rgb_array
