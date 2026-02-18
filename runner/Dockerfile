FROM python:3.11-slim

# Install system dependencies including Xvfb for virtual display
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    xvfb \
    x11vnc \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the autovnc library
COPY autovnc/ ./autovnc/

# Copy entrypoint script
COPY entrypoint.py .

# Create directories
RUN mkdir -p /data/scripts /data/templates /data/runs /run_output

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV DISPLAY=:99

# Run the entrypoint
ENTRYPOINT ["python", "entrypoint.py"]
