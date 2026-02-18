"""
AutoVNC Vision Module

Provides computer vision capabilities using OpenCV for template matching
and Tesseract for OCR text extraction.
"""

import time
import difflib
from typing import Optional, Tuple, Callable, Union
import cv2
import numpy as np
import pytesseract
from PIL import Image
import io
import logging

logger = logging.getLogger(__name__)


def find_template(
    screen: np.ndarray,
    template: np.ndarray,
    threshold: float = 0.8,
    region: Optional[Tuple[int, int, int, int]] = None,
    hint: Optional[Tuple[int, int]] = None
) -> Optional[Tuple[int, int, int, int]]:
    """
    Find a template image within a screen image using OpenCV template matching.
    Supports a two-stage search: local area around hint first, then global.
    
    Args:
        screen: The screen image as a numpy array (BGR format)
        template: The template image to find as a numpy array (BGR format)
        threshold: Match confidence threshold (0.0 to 1.0), default 0.8
        region: Optional (x, y, width, height) to limit search area
        hint: Optional (center_x, center_y) to prioritize a local search area.
              If provided, a 300x300 area around the hint is searched first.
        
    Returns:
        Tuple of (x, y, width, height) if found, None otherwise.
        The coordinates represent the top-left corner and dimensions of the match.
    """
    # Stage 1: Local search if hint provided and no explicit region is set
    if hint and not region:
        hint_x, hint_y = hint
        # Define a 300x300 search area around the hint
        radius = 150
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


def _do_match(
    screen: np.ndarray,
    template: np.ndarray,
    threshold: float = 0.8,
    region: Optional[Tuple[int, int, int, int]] = None
) -> Optional[Tuple[int, int, int, int]]:
    """Internal helper to perform the actual OpenCV matching."""
    # Apply region of interest if specified
    if region:
        x, y, w, h = region
        search_area = screen[y:y+h, x:x+w]
        offset_x, offset_y = x, y
    else:
        search_area = screen
        offset_x, offset_y = 0, 0
    
    # Get template dimensions
    template_h, template_w = template.shape[:2]
    
    # Check if template is larger than search area
    if template_h > search_area.shape[0] or template_w > search_area.shape[1]:
        return None
        
    # Perform template matching
    start_time = time.time()
    if len(template.shape) == 3 and template.shape[2] == 4:
        # Template has alpha channel, use it as a mask
        mask = template[:, :, 3]
        template_rgb = template[:, :, :3]
        
        # cv2.matchTemplate with mask supports TM_SQDIFF and TM_CCORR_NORMED
        result = cv2.matchTemplate(search_area, template_rgb, cv2.TM_CCORR_NORMED, mask=mask)
    else:
        # Convert to grayscale for standard matching
        search_gray = cv2.cvtColor(search_area, cv2.COLOR_BGR2GRAY) if len(search_area.shape) == 3 else search_area
        template_gray = cv2.cvtColor(template, cv2.COLOR_BGR2GRAY) if len(template.shape) == 3 else template
        result = cv2.matchTemplate(search_gray, template_gray, cv2.TM_CCOEFF_NORMED)
    
    # Find the best match
    min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(result)
    elapsed = (time.time() - start_time) * 1000.0
    logger.debug('Template match elapsed=%.1fms region=%s template=%dx%d max_val=%.3f',
                 elapsed, str(region), template_w, template_h, max_val)
    # Fallback to stdout so timing shows in environments without logging configured
    try:
        print(f"[Vision] match elapsed={elapsed:.1f}ms region={region} template={template_w}x{template_h} max_val={max_val:.3f}")
    except Exception:
        pass
    
    if max_val >= threshold:
        match_x = max_loc[0] + offset_x
        match_y = max_loc[1] + offset_y
        return (match_x, match_y, template_w, template_h)
    
    return None


def clean_template_inpainting(template: np.ndarray) -> np.ndarray:
    """
    Remove masked (transparent) areas from a template using inpainting.
    Useful for removing the cursor while maintaining a visual reference.
    
    Args:
        template: 4-channel numpy array (BGRA)
        
    Returns:
        3-channel numpy array (BGR) with masked areas filled in
    """
    if len(template.shape) == 3 and template.shape[2] == 4:
        # Extract RGB and Alpha
        bgr = template[:, :, :3]
        alpha = template[:, :, 3]
        
        # Area where alpha is 0 is the hole to fill
        # Mask for inpaint: 8-bit single-channel image. Non-zero pixels indicate area to be inpainted.
        inpaint_mask = cv2.bitwise_not(alpha)
        
        # Use Telea inpainting
        cleaned_bgr = cv2.inpaint(bgr, inpaint_mask, 3, cv2.INPAINT_TELEA)
        
        # Reconstruct BGRA with original alpha (so we keep the mask for matching!)
        # But we return BGRA so and save it that way.
        cleaned_bgra = cv2.merge((cleaned_bgr[:,:,0], cleaned_bgr[:,:,1], cleaned_bgr[:,:,2], alpha))
        return cleaned_bgra
        
    return template


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
    lang: str = "eng",
    hint: Optional[Tuple[int, int]] = None
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
    
    # Preprocess for better OCR accuracy
    gray = cv2.cvtColor(ocr_area, cv2.COLOR_BGR2GRAY) if len(ocr_area.shape) == 3 else ocr_area
    
    # Scale up small regions for better character recognition
    gh, gw = gray.shape[:2]
    if gw < 300 or gh < 50:
        scale = max(2, 300 // max(gw, 1))
        gray = cv2.resize(gray, (gw * scale, gh * scale), interpolation=cv2.INTER_CUBIC)
    
    # Apply Otsu's thresholding to binarize - separates text from icons/backgrounds
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    # Convert to PIL Image
    pil_image = Image.fromarray(binary)
    
    # Perform OCR with PSM 6 (assume uniform block of text)
    text = pytesseract.image_to_string(pil_image, lang=lang, config='--psm 6')
    
    return text.strip()


def find_text(
    image: np.ndarray,
    search_text: str,
    region: Optional[Tuple[int, int, int, int]] = None,
    lang: str = "eng",
    case_sensitive: bool = False,
    hint: Optional[Tuple[int, int]] = None,
    similarity_threshold: float = 0.7
) -> bool:
    """
    Check if specific text exists in an image.
    Supports a two-stage search: local area around hint first, then global.
    
    Args:
        image: The image as a numpy array
        search_text: The text to search for
        region: Optional ROI to limit search
        lang: Tesseract language code
        case_sensitive: Whether to perform case-sensitive matching
        hint: Optional (center_x, center_y) to prioritize a local search area.
              If provided, a 300x300 area around the hint is searched first.
        
    Returns:
        True if text is found (with sufficient similarity), False otherwise
    """
    # Stage 1: Local search if hint provided and no explicit region is set
    if hint and not region:
        hint_x, hint_y = hint
        radius = 150
        local_x = max(0, hint_x - radius)
        local_y = max(0, hint_y - radius)
        local_w = min(image.shape[1] - local_x, radius * 2)
        local_h = min(image.shape[0] - local_y, radius * 2)
        
        local_region = (local_x, local_y, local_w, local_h)
        if _do_find_text(image, search_text, local_region, lang, case_sensitive, similarity_threshold):
            return True
            
    # Stage 2: Global (or region-constrained) search
    return _do_find_text(image, search_text, region, lang, case_sensitive, similarity_threshold)


def _do_find_text(
    image: np.ndarray,
    search_text: str,
    region: Optional[Tuple[int, int, int, int]] = None,
    lang: str = "eng",
    case_sensitive: bool = False,
    similarity_threshold: float = 0.7
) -> bool:
    """Internal helper to perform OCR text matching."""
    extracted = extract_text(image, region, lang)
    
    target = search_text if case_sensitive else search_text.lower()
    source = extracted if case_sensitive else extracted.lower()
    
    # Exact check first for performance
    if target in source:
        return True
        
    # Fuzzy check: Use SequenceMatcher to find the best match ratio in the text
    # We break the extracted text into chunks similar in size to the search text
    # for better local similarity measurement.
    words = source.split()
    target_words_count = len(target.split())
    
    if not words:
        return False
        
    # Slidding window check for best sub-string match
    for i in range(len(words) - target_words_count + 1):
        chunk = " ".join(words[i:i+target_words_count])
        similarity = difflib.SequenceMatcher(None, target, chunk).ratio()
        if similarity >= similarity_threshold:
            logger.info(f"Fuzzy match found: '{chunk}' looks like '{target}' (similarity: {similarity:.2f})")
            return True
            
    return False


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
    template = cv2.imread(path, cv2.IMREAD_UNCHANGED)
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
    if len(rgb_array.shape) == 3:
        if rgb_array.shape[2] == 4:
            bgr_array = cv2.cvtColor(rgb_array, cv2.COLOR_RGBA2BGRA)
            return bgr_array
        elif rgb_array.shape[2] == 3:
            bgr_array = cv2.cvtColor(rgb_array, cv2.COLOR_RGB2BGR)
            return bgr_array
    
    return rgb_array
