#!/bin/bash

# Build Test Script for Victory Contest Platform
# This script tests if the Docker image builds successfully

set -e

echo "========================================"
echo "Victory Contest Platform - Build Test"
echo "========================================"
echo ""

echo "[1/4] Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi
echo "✅ Docker is installed"
echo ""

echo "[2/4] Building Docker image..."
echo "This may take 5-10 minutes on first build..."
if docker build -t victory-contest-test .; then
    echo "✅ Docker image built successfully"
else
    echo "❌ Docker build failed"
    exit 1
fi
echo ""

echo "[3/4] Checking image size..."
SIZE=$(docker images victory-contest-test --format "{{.Size}}")
echo "📦 Image size: $SIZE"
echo ""

echo "[4/4] Testing image structure..."
if docker run --rm victory-contest-test ls -la /root/static/frontend/index.html > /dev/null 2>&1; then
    echo "✅ Frontend files present"
else
    echo "⚠️  Frontend files might be missing"
fi

if docker run --rm victory-contest-test ls -la /root/static/admin/index.html > /dev/null 2>&1; then
    echo "✅ Admin files present"
else
    echo "⚠️  Admin files might be missing"
fi

if docker run --rm victory-contest-test ls -la /root/main > /dev/null 2>&1; then
    echo "✅ Backend binary present"
else
    echo "❌ Backend binary missing"
    exit 1
fi
echo ""

echo "========================================"
echo "✅ Build test completed successfully!"
echo "========================================"
echo ""
echo "To run the container:"
echo "  docker run -p 8080:8080 \\"
echo "    -e JWT_SECRET=your-secret \\"
echo "    -e AWS_REGION=us-east-1 \\"
echo "    -e AWS_ACCESS_KEY_ID=your-key \\"
echo "    -e AWS_SECRET_ACCESS_KEY=your-secret \\"
echo "    victory-contest-test"
echo ""
echo "Then access:"
echo "  - Frontend: http://localhost:8080"
echo "  - Admin: http://localhost:8080/admin"
echo "  - API: http://localhost:8080/api"
echo ""
