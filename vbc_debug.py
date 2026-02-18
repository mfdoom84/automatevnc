"""
AutoVNC Script: vbcxjoierirte
Generated: 2026-02-05T16:49:01.791Z

No description
"""

from autovnc import Keys


def run(vnc):
    """Execute the automation script."""
    vnc.wait(5.9)
    vnc.right_click(335, 307)
    vnc.wait(3.1)
    vnc.click(408, 467)
    vnc.wait(1.7)
    vnc.click(701, 572)
    vnc.wait(2.4)
    vnc.type("t")
    vnc.type("e")
    vnc.type("s")
    vnc.type("t")
    vnc.press("enter")
    vnc.wait(2.5)
    vnc.click(698, 563)


if __name__ == "__main__":
    from autovnc import VNCClient, ExecutionContext
    import os

    # Connection configuration
    HOST = "localhost"
    PORT = 5900
    PASSWORD = "asdf"

    client = VNCClient(HOST, PORT, password=PASSWORD)
    try:
        client.connect()
        ctx = ExecutionContext(client)
        ctx.wait(2) # Wait for connection to stabilize
        run(ctx)
    finally:
        client.disconnect()