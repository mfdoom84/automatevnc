"""
Run Service

Manages script execution runs, including spawning runner containers
and tracking run status.
"""

import os
import json
import uuid
import asyncio
import shutil
from datetime import datetime
from typing import Dict, Optional, List
import aiofiles
import docker

from ..config import settings
from ..models import Run, RunStatus, VNCCredentials


class RunService:
    """Service for managing script execution runs."""
    
    def __init__(self):
        self.runs_dir = settings.runs_dir
        self.runner_image = settings.runner_image
        self._runs: Dict[str, Run] = {}
        self._docker_client = None
        self._log_watchers: Dict[str, asyncio.Task] = {}
        self._containers: Dict[str, any] = {}  # Track running containers by run_id
    
    @property
    def docker_client(self):
        """Lazy-load Docker client."""
        if self._docker_client is None:
            try:
                self._docker_client = docker.from_env()
            except Exception:
                self._docker_client = None
        return self._docker_client
    
    async def create_run(
        self,
        script_name: str,
        vnc: VNCCredentials,
        chain: Optional[List[str]] = None,
        variables: Optional[Dict] = None
    ) -> Run:
        """Create and queue a new run."""
        run_id = str(uuid.uuid4())[:12]
        
        # Create run directory
        run_dir = os.path.join(self.runs_dir, f"run_{run_id}")
        os.makedirs(run_dir, exist_ok=True)
        
        run = Run(
            id=run_id,
            script_name=script_name,
            status=RunStatus.QUEUED,
            vnc_host=vnc.host,
            vnc_port=vnc.port,
            log_file=os.path.join(run_dir, "execution.log"),
            failure_screenshot=None
        )
        
        self._runs[run_id] = run
        
        # Save run metadata
        await self._save_run_metadata(run)
        
        # Start execution in background
        asyncio.create_task(self._execute_run(
            run,
            vnc,
            chain or [],
            variables or {}
        ))
        
        return run
    
    async def get_run(self, run_id: str) -> Optional[Run]:
        """Get run by ID."""
        # Check in-memory cache first
        if run_id in self._runs:
            return self._runs[run_id]
        
        # Try to load from disk
        run_dir = os.path.join(self.runs_dir, f"run_{run_id}")
        metadata_path = os.path.join(run_dir, "metadata.json")
        
        if os.path.exists(metadata_path):
            async with aiofiles.open(metadata_path, 'r') as f:
                data = json.loads(await f.read())
            run = Run(**data)
            self._runs[run_id] = run
            return run
        
        return None
    
    async def get_run_logs(self, run_id: str) -> Optional[str]:
        """Get logs for a run."""
        run = await self.get_run(run_id)
        if not run or not run.log_file:
            return None
        
        if os.path.exists(run.log_file):
            async with aiofiles.open(run.log_file, 'r') as f:
                return await f.read()
        
        return ""
    
    async def get_run_artifacts(self, run_id: str) -> Optional[Dict]:
        """Get artifact paths for a run."""
        run = await self.get_run(run_id)
        if not run:
            return None
        
        run_dir = os.path.join(self.runs_dir, f"run_{run_id}")
        
        artifacts = {
            "log": run.log_file if run.log_file and os.path.exists(run.log_file) else None,
            "screenshot": None
        }
        
        # Check for failure screenshot
        screenshot_path = os.path.join(run_dir, "failure.png")
        if os.path.exists(screenshot_path):
            artifacts["screenshot"] = screenshot_path
            run.failure_screenshot = screenshot_path
        
        return artifacts
    
    async def list_runs(self, limit: int = 50) -> List[Run]:
        """List recent runs."""
        runs = []
        
        if not os.path.exists(self.runs_dir):
            return runs
        
        for dirname in os.listdir(self.runs_dir):
            if dirname.startswith("run_"):
                run_id = dirname[4:]
                run = await self.get_run(run_id)
                if run:
                    runs.append(run)
        
        # Sort by started_at descending
        runs.sort(
            key=lambda r: r.started_at or datetime.min,
            reverse=True
        )
        
        return runs[:limit]
    
    async def cancel_run(self, run_id: str) -> bool:
        """Cancel a running script by stopping its container."""
        run = await self.get_run(run_id)
        if not run:
            return False
        
        # Can only cancel if still queued or running
        if run.status not in [RunStatus.QUEUED, RunStatus.RUNNING]:
            return False
        
        # Try to stop the container if it exists
        if run_id in self._containers:
            container = self._containers[run_id]
            try:
                container.stop(timeout=10)
                await self._append_log(run, "Run cancelled by user")
            except Exception as e:
                await self._append_log(run, f"Failed to stop container: {e}")
        else:
            # Container not found (might be queued or in-process)
            await self._append_log(run, "Run cancelled by user")
        
        run.status = RunStatus.CANCELLED
        run.completed_at = datetime.utcnow()
        await self._save_run_metadata(run)
        return True
    
    async def delete_run(self, run_id: str) -> bool:
        """Delete a run and all its associated data."""
        run = await self.get_run(run_id)
        if not run:
            return False
        
        # Cancel if running
        if run.status in [RunStatus.QUEUED, RunStatus.RUNNING]:
            await self.cancel_run(run_id)
        
        # Remove from in-memory cache
        if run_id in self._runs:
            del self._runs[run_id]
        
        # Remove from containers tracking
        if run_id in self._containers:
            del self._containers[run_id]
        
        # Remove run directory
        run_dir = os.path.join(self.runs_dir, f"run_{run_id}")
        if os.path.exists(run_dir):
            try:
                shutil.rmtree(run_dir)
            except Exception as e:
                print(f"Failed to delete run directory {run_dir}: {e}")
                return False
        
        return True
    
    async def _execute_run(
        self,
        run: Run,
        vnc: VNCCredentials,
        chain: List[str],
        variables: Dict
    ) -> None:
        """Execute a run using Docker runner container."""
        run.status = RunStatus.RUNNING
        run.started_at = datetime.utcnow()
        await self._save_run_metadata(run)
        
        # Resolve VNC host and port
        host = vnc.host
        port = vnc.port
        if ":" in host:
            try:
                h, p = host.split(":", 1)
                host = h
                port = int(p)
            except ValueError:
                pass
        
        if host.lower() in ["localhost", "127.0.0.1"]:
            host = "host.docker.internal"
            
        resolved_vnc = vnc.model_copy(update={"host": host, "port": port})
        
        try:
            await self._append_log(run, f"Starting execution of script: {run.script_name}")
            await self._append_log(run, f"VNC target: {host}:{port}")
            
            if self.docker_client is None:
                # Fallback: execute in-process (for development)
                await self._execute_in_process(run, resolved_vnc, chain, variables)
            else:
                # Execute in Docker container
                await self._execute_in_container(run, resolved_vnc, chain, variables)
            
            run.status = RunStatus.SUCCESS
            run.exit_code = 0
            await self._append_log(run, "Execution completed successfully")
            
        except Exception as e:
            run.status = RunStatus.FAILED
            run.exit_code = 1
            run.error_message = str(e)
            await self._append_log(run, f"Execution failed: {e}")
        
        finally:
            run.completed_at = datetime.utcnow()
            await self._save_run_metadata(run)
    
    async def _execute_in_container(
        self,
        run: Run,
        vnc: VNCCredentials,
        chain: List[str],
        variables: Dict
    ) -> None:
        """Execute script in a Docker container."""
        run_dir = os.path.join(self.runs_dir, f"run_{run.id}")
        
        # Prepare environment variables
        # We tell the runner where to save logs and screenshots inside the /data volume
        log_file_path = f"/data/runs/run_{run.id}/execution.log"
        screenshot_path = f"/data/runs/run_{run.id}/failure.png"
        
        env = {
            "VNC_HOST": vnc.host,
            "VNC_PORT": str(vnc.port),
            "SCRIPT_NAME": run.script_name,
            "RUN_ID": run.id,
            "AUTOVNC_HEADLESS": "true",
            "LOG_FILE": log_file_path,
            "SCREENSHOT_FILE": screenshot_path,
        }
        
        if vnc.password:
            env["VNC_PASSWORD"] = vnc.password
        
        if chain:
            env["CHAIN_SCRIPTS"] = ",".join(chain)
        
        if variables:
            env["VARIABLES"] = json.dumps(variables)
        
        await self._append_log(run, f"Spawning runner container: {self.runner_image}")
        
        # Determine data volume name. Default to 'autovnc-data' if not set.
        data_volume = os.environ.get("DATA_VOLUME", "autovnc-data")
        
        # Run container
        container = self.docker_client.containers.run(
            self.runner_image,
            environment=env,
            volumes={
                data_volume: {"bind": "/data", "mode": "rw"}
            },
            network_mode="host",
            detach=True,
            remove=False
        )
        
        # Store container reference for cancellation
        self._containers[run.id] = container
        
        try:
            # Wait for container to complete
            result = container.wait(timeout=300)  # 5 minute timeout
            exit_code = result.get("StatusCode", 1)
            
            # Get container logs
            logs = container.logs().decode('utf-8')
            await self._append_log(run, logs)
            
            if exit_code != 0:
                raise RuntimeError(f"Container exited with code {exit_code}")
        
        finally:
            # Clean up container reference
            self._containers.pop(run.id, None)
            
            # Remove the container
            try:
                container.remove()
            except Exception:
                pass
    
    async def _execute_in_process(
        self,
        run: Run,
        vnc: VNCCredentials,
        chain: List[str],
        variables: Dict
    ) -> None:
        """Execute script in-process (development fallback)."""
        import sys
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
        
        from autovnc import VNCClient, ExecutionContext
        
        await self._append_log(run, "Executing in-process (Docker not available)")
        
        # Create thread-safe logger first
        loop = asyncio.get_running_loop()
        def thread_safe_log(msg):
            asyncio.run_coroutine_threadsafe(self._append_log(run, msg), loop)

        # Connect to VNC
        client = VNCClient(
            host=vnc.host,
            port=vnc.port,
            password=vnc.password,
            templates_dir=os.path.join(settings.templates_dir, run.script_name),
            logger=thread_safe_log
        )
        
        try:
            await asyncio.to_thread(client.connect)
            await self._append_log(run, "Connected to VNC server")

            ctx = ExecutionContext(
                vnc_client=client,
                scripts_dir=settings.scripts_dir,
                templates_dir=settings.templates_dir,
                variables=variables,
                logger=thread_safe_log
            )
            
            # Run the main script in a separate thread to avoid blocking the event loop
            await self._append_log(run, f"Running script: {run.script_name}")
            await asyncio.to_thread(ctx.run_script, run.script_name)
            
            # Run chained scripts in thread
            for script_name in chain:
                await self._append_log(run, f"Running chained script: {script_name}")
                await asyncio.to_thread(ctx.run_script, script_name)
            
        except Exception as e:
            # Capture failure screenshot
            run_dir = os.path.join(self.runs_dir, f"run_{run.id}")
            try:
                client.save_screenshot(os.path.join(run_dir, "failure.png"))
                await self._append_log(run, "Captured failure screenshot")
            except Exception:
                pass
            raise
        
        finally:
            client.disconnect(quiet=True)
    
    async def _append_log(self, run: Run, message: str) -> None:
        """Append a message to the run's log file."""
        if run.log_file:
            timestamp = datetime.utcnow().isoformat()
            log_line = f"[{timestamp}] {message}\n"
            
            async with aiofiles.open(run.log_file, 'a') as f:
                await f.write(log_line)
    
    async def _save_run_metadata(self, run: Run) -> None:
        """Save run metadata to disk."""
        run_dir = os.path.join(self.runs_dir, f"run_{run.id}")
        os.makedirs(run_dir, exist_ok=True)
        
        metadata_path = os.path.join(run_dir, "metadata.json")
        
        async with aiofiles.open(metadata_path, 'w') as f:
            await f.write(json.dumps(run.model_dump(mode='json'), indent=2, default=str))


# Global service instance
run_service = RunService()
