"""
VNC Proxy Service

Provides WebSocket-to-TCP proxying for VNC connections,
enabling noVNC in the browser to connect to VNC servers.
"""

import asyncio
from typing import Optional
import websockets
from websockets.server import WebSocketServerProtocol


class VNCProxy:
    """WebSocket to VNC TCP proxy."""
    
    def __init__(self, vnc_host: str, vnc_port: int = 5900):
        self.vnc_host = vnc_host
        self.vnc_port = vnc_port
        self._reader: Optional[asyncio.StreamReader] = None
        self._writer: Optional[asyncio.StreamWriter] = None
        self._running = False
    
    async def connect(self) -> bool:
        """Connect to the VNC server."""
        try:
            self._reader, self._writer = await asyncio.open_connection(
                self.vnc_host,
                self.vnc_port
            )
            self._running = True
            return True
        except Exception as e:
            print(f"Failed to connect to VNC server: {e}")
            return False
    
    async def disconnect(self) -> None:
        """Disconnect from the VNC server."""
        self._running = False
        if self._writer:
            self._writer.close()
            try:
                await self._writer.wait_closed()
            except Exception:
                pass
            self._writer = None
            self._reader = None
    
    async def forward_to_vnc(self, data: bytes) -> None:
        """Forward data from WebSocket to VNC server."""
        if self._writer and self._running:
            self._writer.write(data)
            await self._writer.drain()
    
    async def read_from_vnc(self, n: int = 65536) -> Optional[bytes]:
        """Read data from VNC server."""
        if self._reader and self._running:
            try:
                return await asyncio.wait_for(
                    self._reader.read(n),
                    timeout=0.1
                )
            except asyncio.TimeoutError:
                return None
            except Exception:
                return None
        return None
    
    async def proxy_loop(self, websocket: WebSocketServerProtocol) -> None:
        """Main proxy loop between WebSocket and VNC."""
        if not await self.connect():
            await websocket.close(1011, "Failed to connect to VNC server")
            return
        
        try:
            # Create tasks for bidirectional forwarding
            async def ws_to_vnc():
                """Forward WebSocket messages to VNC."""
                try:
                    async for message in websocket:
                        if isinstance(message, bytes):
                            await self.forward_to_vnc(message)
                except websockets.exceptions.ConnectionClosed:
                    pass
            
            async def vnc_to_ws():
                """Forward VNC data to WebSocket."""
                while self._running:
                    data = await self.read_from_vnc()
                    if data:
                        try:
                            await websocket.send(data)
                        except websockets.exceptions.ConnectionClosed:
                            break
                    else:
                        await asyncio.sleep(0.01)
            
            # Run both directions concurrently
            await asyncio.gather(
                ws_to_vnc(),
                vnc_to_ws(),
                return_exceptions=True
            )
        
        finally:
            await self.disconnect()


async def create_vnc_proxy_handler(vnc_host: str, vnc_port: int):
    """Create a WebSocket handler for VNC proxying."""
    async def handler(websocket: WebSocketServerProtocol, path: str):
        proxy = VNCProxy(vnc_host, vnc_port)
        await proxy.proxy_loop(websocket)
    return handler
