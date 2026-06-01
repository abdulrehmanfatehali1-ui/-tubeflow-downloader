# Base Image
FROM python:3.11-slim

# Install system dependencies (ffmpeg required for yt-dlp merging)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    libcurl4 \
    libnss3 \
    libnspr4 \
    && rm -rf /var/lib/apt/lists/*

# Copy the Deno JavaScript runtime from the official binary image to enable yt-dlp signature deciphering!
COPY --from=denoland/deno:bin /deno /usr/local/bin/deno

# Copy the bgutil-pot binary for Proof of Origin (PO) Token generation!
COPY --from=ghcr.io/jim60105/bgutil-pot:latest /bgutil-pot /usr/local/bin/bgutil-pot

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
