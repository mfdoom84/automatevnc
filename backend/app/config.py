"""
AutoVNC Backend Configuration

Loads configuration from environment variables and provides
typed access to settings.
"""

import os
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application settings loaded from environment."""
    
    # Data directories
    data_dir: str = Field(default="/data", env="DATA_DIR")
    
    @property
    def scripts_dir(self) -> str:
        return os.path.join(self.data_dir, "scripts")
    
    @property
    def templates_dir(self) -> str:
        return os.path.join(self.data_dir, "templates")
    
    @property
    def runs_dir(self) -> str:
        return os.path.join(self.data_dir, "runs")
    
    # AI Configuration
    ai_provider: str = Field(default="openai", env="AI_PROVIDER")
    openai_api_key: Optional[str] = Field(default=None, env="OPENAI_API_KEY")
    github_models_api_key: Optional[str] = Field(default=None, env="GITHUB_MODELS_API_KEY")
    
    # Runner Configuration
    runner_image: str = Field(default="autovnc-runner:latest", env="RUNNER_IMAGE")
    
    # Server Configuration
    cors_origins: list[str] = Field(
        default=["http://localhost:3000", "http://127.0.0.1:3000"],
        env="CORS_ORIGINS"
    )
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# Global settings instance
settings = Settings()


def ensure_directories():
    """Ensure all required directories exist."""
    os.makedirs(settings.scripts_dir, exist_ok=True)
    os.makedirs(settings.templates_dir, exist_ok=True)
    os.makedirs(settings.runs_dir, exist_ok=True)
