"""
VNC Router

WebSocket endpoint for VNC proxying and OCR operations.
"""

import asyncio
import base64
import numpy as np
import cv2
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import pytesseract
from PIL import Image
import io

router = APIRouter(tags=["vnc"])


def resolve_vnc_host(host: str, port: int) -> tuple[str, int]:
    """
    Resolve host and port for VNC connection.
    
    If host contains a port (e.g. localhost:5901), extract it.
    Translate 'localhost' or '127.0.0.1' to 'host.docker.internal'
    for Docker-to-Host networking on Windows/Mac.
    """
    # Handle host:port format
    if ":" in host:
        try:
            h, p = host.split(":", 1)
            host = h
            port = int(p)
        except ValueError:
            pass
            
    # Translate localhost for Docker
    if host.lower() in ["localhost", "127.0.0.1"]:
        # host.docker.internal is standard for Docker Desktop
        # On Linux it might require --add-host=host.docker.internal:host-gateway
        host = "host.docker.internal"
        
    return host, port


@router.websocket("/api/vnc/proxy")
async def vnc_proxy(
    websocket: WebSocket,
    host: str = Query(..., description="VNC server hostname"),
    port: int = Query(5900, description="VNC server port")
):
    """
    WebSocket endpoint for VNC proxying.
    
    Connects the browser WebSocket to a VNC server via TCP,
    enabling noVNC to work through the backend.
    """
    await websocket.accept()
    
    # Resolve host and port
    resolved_host, resolved_port = resolve_vnc_host(host, port)
    
    reader = None
    writer = None
    
    try:
        # Connect to VNC server
        reader, writer = await asyncio.open_connection(resolved_host, resolved_port)
        
        async def ws_to_vnc():
            """Forward WebSocket data to VNC server."""
            try:
                while True:
                    data = await websocket.receive_bytes()
                    writer.write(data)
                    await writer.drain()
            except WebSocketDisconnect:
                pass
            except Exception:
                pass
        
        async def vnc_to_ws():
            """Forward VNC server data to WebSocket."""
            try:
                while True:
                    data = await reader.read(65536)
                    if not data:
                        break
                    await websocket.send_bytes(data)
            except Exception:
                pass
        
        # Run both directions concurrently
        await asyncio.gather(
            ws_to_vnc(),
            vnc_to_ws(),
            return_exceptions=True
        )
    
    except ConnectionRefusedError:
        await websocket.close(1011, f"Connection refused at {resolved_host}:{resolved_port}. Is your VNC server running?")
    
    except OSError as e:
        error_msg = str(e)
        if "Multiple exceptions" in error_msg:
            error_msg = "Could not reach the host. Check the address and ensure the server is accessible."
        await websocket.close(1011, error_msg)
    
    except Exception as e:
        await websocket.close(1011, f"VNC proxy error: {str(e)}")
    
    finally:
        if writer:
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass


@router.get("/api/vnc/test")
async def test_vnc_connection(
    host: str = Query(..., description="VNC server hostname"),
    port: int = Query(5900, description="VNC server port")
):
    """
    Test if a VNC server is reachable.
    
    Returns connection status without establishing a full session.
    """
    # Resolve host and port
    resolved_host, resolved_port = resolve_vnc_host(host, port)
    
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(resolved_host, resolved_port),
            timeout=5.0
        )
        
        # Read the VNC server greeting
        greeting = await asyncio.wait_for(reader.read(12), timeout=2.0)
        
        writer.close()
        await writer.wait_closed()
        
        # Check if it looks like a VNC server
        if greeting.startswith(b"RFB "):
            version = greeting.decode('ascii', errors='ignore').strip()
            return {
                "status": "ok",
                "host": resolved_host,
                "port": resolved_port,
                "rfb_version": version
            }
        else:
            return {
                "status": "warning",
                "host": resolved_host,
                "port": resolved_port,
                "message": "Connected but received unexpected response"
            }
    
    except asyncio.TimeoutError:
        return {
            "status": "error",
            "host": resolved_host,
            "port": resolved_port,
            "message": f"Connection to {resolved_host}:{resolved_port} timed out"
        }
    
    except ConnectionRefusedError:
        return {
            "status": "error",
            "host": resolved_host,
            "port": resolved_port,
            "message": f"Connection refused at {resolved_host}:{resolved_port}. Is your VNC server running?"
        }
    
    except OSError as e:
        # Handle cases like "Network is unreachable" or "Host is down"
        error_msg = str(e)
        if "Multiple exceptions" in error_msg:
            # Clean up asyncio's "Multiple exceptions" message
            error_msg = "Could not reach the host. Check the address and ensure the server is accessible."
            
        return {
            "status": "error",
            "host": resolved_host,
            "port": resolved_port,
            "message": error_msg
        }
    
    except Exception as e:
        return {
            "status": "error",
            "host": resolved_host,
            "port": resolved_port,
            "message": f"Connect error: {str(e)}"
        }


class OcrRequest(BaseModel):
    image: str  # Base64 encoded image
    lang: str = "eng"


class OcrResponse(BaseModel):
    text: str
    confidence: Optional[float] = None


@router.post("/api/vnc/ocr", response_model=OcrResponse)
async def perform_ocr(request: OcrRequest):
    """
    Perform OCR on a base64 encoded image.
    
    Used during recording to extract text from a selected region
    for the "Verify Text" feature.
    """
    try:
        # Decode base64 image (strip data URL prefix if present)
        image_b64 = request.image
        if ',' in image_b64:
            image_b64 = image_b64.split(',', 1)[1]
        image_data = base64.b64decode(image_b64)
        
        # Convert to numpy array
        image = cv2.imdecode(
            np.frombuffer(image_data, dtype=np.uint8),
            cv2.IMREAD_COLOR
        )
        
        if image is None:
            raise HTTPException(status_code=400, detail="Invalid image data")
        
        # Preprocess for better OCR accuracy (reduce icon/image noise)
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Scale up small captures for better OCR accuracy
        h, w = gray.shape[:2]
        if w < 300 or h < 50:
            scale = max(2, 300 // max(w, 1))
            gray = cv2.resize(gray, (w * scale, h * scale), interpolation=cv2.INTER_CUBIC)
        
        # Apply Otsu's thresholding to binarize - this separates text from icons/backgrounds
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # Convert to PIL Image
        pil_image = Image.fromarray(binary)
        
        # Perform OCR with PSM 6 (assume uniform block of text)
        custom_config = r'--psm 6'
        text = pytesseract.image_to_string(pil_image, lang=request.lang, config=custom_config)
        
        # Get confidence data (optional)
        try:
            data = pytesseract.image_to_data(pil_image, lang=request.lang, output_type=pytesseract.Output.DICT)
            confidences = [int(d) for d in data['conf'] if d > 0]
            avg_confidence = sum(confidences) / len(confidences) if confidences else None
        except Exception:
            avg_confidence = None
        
        return OcrResponse(
            text=text.strip(),
            confidence=avg_confidence
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR failed: {str(e)}")
