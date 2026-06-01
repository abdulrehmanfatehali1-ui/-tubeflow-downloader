# Base Image
FROM python:3.11-slim

# Install system dependencies (ffmpeg required for yt-dlp merging)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    libcurl4 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for layer caching
COPY requirements.txt .

# Install python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy all application files
COPY . .

# HuggingFace Spaces uses port 7860
EXPOSE 7860

# Environment variable
ENV PORT=7860

# Run Flask app
CMD ["python", "app.py"]
