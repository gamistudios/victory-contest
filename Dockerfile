# Multi-stage Dockerfile for Victory Contest Platform
# Serves Backend API + Frontend + Admin Panel

# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --legacy-peer-deps
COPY frontend/ ./
RUN npm run build

# Stage 2: Build Admin Panel
FROM node:20-alpine AS admin-builder
WORKDIR /app/admin
COPY admin-page/package*.json ./
RUN npm ci --legacy-peer-deps
COPY admin-page/ ./
RUN npm run build

# Stage 3: Build Go Backend
FROM golang:1.24-alpine AS backend-builder
WORKDIR /app/backend

# Install build dependencies
RUN apk add --no-cache git

# Copy go mod files
COPY backend/go.mod backend/go.sum ./
RUN go mod download

# Copy backend source
COPY backend/ ./

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

# Stage 4: Final Runtime Image
FROM alpine:latest

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /root/

# Copy the backend binary
COPY --from=backend-builder /app/backend/main .

# Create directories for static files
RUN mkdir -p /root/static/frontend /root/static/admin

# Copy built frontend and admin static files
COPY --from=frontend-builder /app/frontend/dist /root/static/frontend
COPY --from=admin-builder /app/admin/dist /root/static/admin

# Copy .env.example as reference (users should provide their own .env)
COPY backend/.env.example /root/.env.example

# Expose port (Koyeb/Render will use PORT env variable)
EXPOSE 8080

# Run the binary
CMD ["./main"]
