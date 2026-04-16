# Multi-stage build for Cybersecurity Dashboard
FROM node:20-alpine AS frontend-builder

# Set working directory
WORKDIR /app/frontend

# Copy package files
COPY package*.json ./

# Install dependencies deterministically (including dev dependencies for build)
RUN npm ci

# Copy source code and config files
COPY src/ ./src/
COPY index.html ./
COPY vite.config.ts ./
COPY tsconfig.json ./
COPY tsconfig.node.json ./

# Build the frontend
RUN npm run build

# Python Flask backend stage
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt requirements-postgres.txt ./

# Install system dependencies, Python packages, then remove build tools in a
# single layer so compiler toolchain never bloats the final image.
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update -o Acquire::Retries=3 -o Acquire::ForceIPv4=true && \
        apt-get install -y --no-install-recommends \
            ca-certificates \
            curl \
            build-essential \
            gcc \
            g++ \
        && grep -v -E "^#|pytest|black|flake8" requirements.txt > /tmp/requirements-prod.txt \
        && pip install --no-cache-dir -r /tmp/requirements-prod.txt -r requirements-postgres.txt \
        && rm /tmp/requirements-prod.txt \
        && apt-get purge -y --auto-remove build-essential gcc g++ \
        && rm -rf /var/lib/apt/lists/*

# Copy Flask application
COPY backend/ ./backend/
COPY config/ ./config/

# Copy built frontend from previous stage
COPY --from=frontend-builder /app/frontend/build ./static

# Create non-root user, directories, and set ownership in one layer
RUN groupadd -r appuser && useradd -r -g appuser appuser \
    && mkdir -p logs data/uploads \
    && chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/api/v1/health || exit 1

# Run the application
CMD ["python", "backend/app.py"]
