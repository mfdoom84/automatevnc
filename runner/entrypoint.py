"""
AutoVNC Runner Entrypoint

Headless script execution entry point for Docker containers.
Connects to VNC, executes script(s), and captures failure artifacts.
"""

import os
import sys
import json
import traceback
from datetime import datetime

# Add autovnc to path
sys.path.insert(0, '/app')

from autovnc import VNCClient, ExecutionContext


def log(message: str) -> None:
    """Log a message with timestamp."""
    timestamp = datetime.utcnow().isoformat()
    print(f"[{timestamp}] {message}", flush=True)
    
    # Also write to log file
    log_file = os.environ.get('LOG_FILE', '/run_output/execution.log')
    with open(log_file, 'a') as f:
        f.write(f"[{timestamp}] {message}\n")


def main() -> int:
    """Main execution function."""
    # Get configuration from environment
    vnc_host = os.environ.get('VNC_HOST')
    vnc_port = int(os.environ.get('VNC_PORT', 5900))
    vnc_password = os.environ.get('VNC_PASSWORD', None)
    script_name = os.environ.get('SCRIPT_NAME')
    run_id = os.environ.get('RUN_ID', 'unknown')
    chain_scripts = os.environ.get('CHAIN_SCRIPTS', '').split(',')
    chain_scripts = [s.strip() for s in chain_scripts if s.strip()]
    
    # Parse variables if provided
    variables = {}
    variables_json = os.environ.get('VARIABLES', '')
    if variables_json:
        try:
            variables = json.loads(variables_json)
        except json.JSONDecodeError:
            log(f"Warning: Could not parse VARIABLES: {variables_json}")
    
    # Validate required parameters
    if not vnc_host:
        log("ERROR: VNC_HOST environment variable is required")
        return 1
    
    if not script_name:
        log("ERROR: SCRIPT_NAME environment variable is required")
        return 1
    
    log(f"AutoVNC Runner starting")
    log(f"Run ID: {run_id}")
    log(f"Script: {script_name}")
    log(f"VNC Target: {vnc_host}:{vnc_port}")
    
    if chain_scripts:
        log(f"Chained scripts: {', '.join(chain_scripts)}")
    
    # Create VNC client
    templates_dir = os.path.join('/data/templates', script_name)
    client = VNCClient(
        host=vnc_host,
        port=vnc_port,
        password=vnc_password,
        templates_dir=templates_dir
    )
    
    try:
        # Connect to VNC
        log("Connecting to VNC server...")
        client.connect()
        log("Connected successfully")
        
        # Create execution context
        ctx = ExecutionContext(
            vnc_client=client,
            scripts_dir='/data/scripts',
            templates_dir='/data/templates',
            variables=variables
        )
        
        # Execute main script
        log(f"Executing script: {script_name}")
        ctx.run_script(script_name)
        log(f"Script {script_name} completed")
        
        # Execute chained scripts
        for chain_script in chain_scripts:
            log(f"Executing chained script: {chain_script}")
            ctx.run_script(chain_script)
            log(f"Chained script {chain_script} completed")
        
        log("All scripts completed successfully")
        return 0
    
    except Exception as e:
        error_msg = str(e)
        log(f"ERROR: Script execution failed: {error_msg}")
        log(f"Traceback:\n{traceback.format_exc()}")
        
        # Capture failure screenshot
        try:
            screenshot_path = os.environ.get('SCREENSHOT_FILE', '/data/failure.png')
            # Ensure the directory exists
            os.makedirs(os.path.dirname(screenshot_path), exist_ok=True)
            client.save_screenshot(screenshot_path)
            log(f"Failure screenshot saved to {screenshot_path}")
        except Exception as ss_error:
            log(f"Warning: Could not capture failure screenshot: {ss_error}")
        
        return 1
    
    finally:
        # Disconnect
        try:
            client.disconnect()
            log("Disconnected from VNC server")
        except Exception:
            pass


if __name__ == '__main__':
    exit_code = main()
    log(f"Runner exiting with code {exit_code}")
    sys.exit(exit_code)
