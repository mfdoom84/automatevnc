"""
AutoVNC Execution Context

Provides a context for script chaining, allowing multiple scripts
to share a single VNC session.
"""

import os
import sys
import importlib.util
from typing import Optional, Dict, Any, Callable

from .client import VNCClient


class ExecutionContext:
    """
    Execution context for chained script execution.
    
    Allows multiple scripts to share a single VNC session,
    enabling modular automation workflows.
    """
    
    def __init__(
        self,
        vnc_client: VNCClient,
        scripts_dir: str = "/data/scripts",
        templates_dir: str = "/data/templates",
        variables: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize execution context.
        
        Args:
            vnc_client: The VNC client to use for all scripts
            scripts_dir: Directory containing script files
            templates_dir: Directory containing image templates
            variables: Optional shared variables dictionary
        """
        self.vnc = vnc_client
        self.scripts_dir = scripts_dir
        self.templates_dir = templates_dir
        self.variables = variables or {}
        self._script_cache: Dict[str, Callable] = {}
        
    def set(self, key: str, value: Any) -> "ExecutionContext":
        """
        Set a shared variable.
        
        Args:
            key: Variable name
            value: Variable value
            
        Returns:
            Self for method chaining
        """
        self.variables[key] = value
        return self
    
    def get(self, key: str, default: Any = None) -> Any:
        """
        Get a shared variable.
        
        Args:
            key: Variable name
            default: Default value if not found
            
        Returns:
            Variable value or default
        """
        return self.variables.get(key, default)
    
    def _load_script(self, name: str) -> Callable:
        """
        Load a script module and extract its run function.
        
        Args:
            name: Script name (without .py extension)
            
        Returns:
            The script's run function
        """
        # Check cache first
        if name in self._script_cache:
            return self._script_cache[name]
        
        # Find the script file
        script_path = os.path.join(self.scripts_dir, f"{name}.py")
        if not os.path.exists(script_path):
            raise FileNotFoundError(f"Script not found: {script_path}")
        
        # Load the module
        spec = importlib.util.spec_from_file_location(name, script_path)
        if spec is None or spec.loader is None:
            raise ImportError(f"Could not load script: {script_path}")
            
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
        
        # Get the run function
        if not hasattr(module, "run"):
            raise AttributeError(f"Script {name} does not have a 'run' function")
        
        run_func = getattr(module, "run")
        self._script_cache[name] = run_func
        
        return run_func
    
    def run_script(self, name: str, **kwargs) -> Any:
        """
        Execute a script by name.
        
        The script must define a `run(ctx)` or `run(vnc)` function.
        
        Args:
            name: Script name (without .py extension)
            **kwargs: Additional arguments to pass to the script
            
        Returns:
            Return value of the script's run function
        """
        run_func = self._load_script(name)
        
        # Merge kwargs into a copy of variables
        script_vars = {**self.variables, **kwargs}
        
        # Try to call with context first, then vnc
        import inspect
        sig = inspect.signature(run_func)
        params = list(sig.parameters.keys())
        
        if len(params) == 0:
            return run_func()
        elif params[0] in ("ctx", "context"):
            return run_func(self, **{k: v for k, v in kwargs.items() if k in params[1:]})
        elif params[0] == "vnc":
            return run_func(self.vnc, **{k: v for k, v in kwargs.items() if k in params[1:]})
        else:
            # Pass all variables
            return run_func(self, **{k: v for k, v in kwargs.items() if k in params[1:]})
    
    def run_inline(self, code: str, **kwargs) -> Any:
        """
        Execute inline Python code.
        
        The code can reference 'ctx' and 'vnc' directly.
        
        Args:
            code: Python code to execute
            **kwargs: Additional variables to inject
            
        Returns:
            Return value if the code returns something
        """
        # Create execution namespace
        namespace = {
            "ctx": self,
            "vnc": self.vnc,
            **self.variables,
            **kwargs
        }
        
        # Execute the code
        exec(code, namespace)
        
        # Return result if set
        return namespace.get("result")
    
    def chain(self, *script_names: str) -> "ExecutionContext":
        """
        Execute multiple scripts in sequence.
        
        Args:
            *script_names: Names of scripts to run in order
            
        Returns:
            Self for method chaining
        """
        for name in script_names:
            self.run_script(name)
        return self


def create_context(
    host: str,
    port: int = 5900,
    password: Optional[str] = None,
    scripts_dir: str = "/data/scripts",
    templates_dir: str = "/data/templates"
) -> ExecutionContext:
    """
    Create a new execution context with a VNC connection.
    
    Args:
        host: VNC server hostname
        port: VNC server port
        password: VNC password
        scripts_dir: Directory containing scripts
        templates_dir: Directory containing templates
        
    Returns:
        Connected execution context
    """
    client = VNCClient(host, port, password, templates_dir)
    client.connect()
    
    return ExecutionContext(
        vnc_client=client,
        scripts_dir=scripts_dir,
        templates_dir=templates_dir
    )
