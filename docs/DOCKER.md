# 🐳 Docker Quick Start Guide

## Single Command Deploy

Get the entire Victory Contest Platform (Backend + Frontend + Admin) running in under 5 minutes!

### Prerequisites

- Docker installed ([Get Docker](https://docs.docker.com/get-docker/))
- AWS credentials with DynamoDB access
- DynamoDB tables created (see backend README)

### Option 1: Docker Run (Quick Test)

```bash
# Build the image
docker build -t victory-contest .

# Run with your environment variables
docker run -d -p 8080:8080 \
  --name victory-contest \
  -e JWT_SECRET="change-me-to-a-long-random-string" \
  -e AWS_REGION="us-east-1" \
  -e AWS_ACCESS_KEY_ID="your-aws-key" \
  -e AWS_SECRET_ACCESS_KEY="your-aws-secret" \
  -e QUESTION_TABLE="question" \
  -e CONTEST_TABLE="contests" \
  -e STUDENT_TABLE="student" \
  -e SUBMISSION_TABLE="submissions" \
  -e ADMIN_TABLE="admin" \
  -e NOTIFICATION_TABLE="notification" \
  -e ACHIEVEMENT_TABLE="achievement" \
  -e CONTEST_REGISTRATION_TABLE="contest_registeration" \
  victory-contest

# View logs
docker logs -f victory-contest

# Stop container
docker stop victory-contest

# Remove container
docker rm victory-contest
```

### Option 2: Docker Compose (Recommended)

```bash
# 1. Create .env file from example
cp backend/.env.example .env

# 2. Edit .env with your actual values
nano .env  # or use your favorite editor

# 3. Start everything
docker-compose up -d

# View logs
docker-compose logs -f

# Stop everything
docker-compose down
```

### Access Your Applications

Once running:

| Application | URL | Description |
|------------|-----|-------------|
| **Frontend** | http://localhost:8080 | Student-facing contest platform |
| **Admin Panel** | http://localhost:8080/admin | Admin dashboard |
| **API** | http://localhost:8080/api | REST API endpoints |

### Verify Deployment

```bash
# Check if container is running
docker ps

# Test API endpoint
curl http://localhost:8080/api/admin/login

# Check frontend
curl http://localhost:8080

# Check admin panel
curl http://localhost:8080/admin
```

### Environment Variables

#### Required

```bash
JWT_SECRET=your-secret-key-here
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

#### DynamoDB Tables (Required)

```bash
QUESTION_TABLE=question
CONTEST_TABLE=contests
STUDENT_TABLE=student
SUBMISSION_TABLE=submissions
ADMIN_TABLE=admin
NOTIFICATION_TABLE=notification
ACHIEVEMENT_TABLE=achievement
CONTEST_REGISTRATION_TABLE=contest_registeration
```

#### Optional

```bash
CLOUDINARY_URL=cloudinary://...
GOOGLE_API_KEY=AIza...
TELEGRAM_BOT_TOKEN=123456789:ABC...
CORS_ALLOWED_ORIGINS=https://yourdomain.com
ALLOW_DEV_AUTH=false
AI_REQUESTS_PER_MINUTE=30
```

### Test Build (Optional)

Run the build test script to verify everything works:

```bash
./build-test.sh
```

### Troubleshooting

#### Container won't start

```bash
# Check logs for errors
docker logs victory-contest

# Common issues:
# 1. JWT_SECRET not set
# 2. AWS credentials invalid
# 3. DynamoDB tables don't exist
```

#### Frontend shows blank page

```bash
# Check if static files were built
docker exec victory-contest ls -la /root/static/frontend

# Should show index.html and assets folder
```

#### Admin panel not accessible

```bash
# Check if admin files exist
docker exec victory-contest ls -la /root/static/admin

# Test admin route
curl -I http://localhost:8080/admin
```

#### CORS errors in browser

```bash
# For production, set CORS_ALLOWED_ORIGINS
# Format: https://domain1.com,https://domain2.com
# No spaces, no trailing slashes

docker run ... \
  -e CORS_ALLOWED_ORIGINS="https://yourdomain.com,https://admin.yourdomain.com" \
  ...
```

### Production Deployment

For production deployment on cloud platforms (Koyeb, Render, Railway, etc.), see:

📖 **[Full Deployment Guide](./DEPLOYMENT.md)**

### Architecture

```
┌─────────────────────────────────────┐
│   Docker Container (Port 8080)      │
├─────────────────────────────────────┤
│                                     │
│  ┌──────────────────────────────┐  │
│  │   Go Backend (Gin Server)    │  │
│  ├──────────────────────────────┤  │
│  │   Routes:                     │  │
│  │   /api/*  → Backend API      │  │
│  │   /admin/* → Admin SPA       │  │
│  │   /*      → Frontend SPA     │  │
│  └──────────────────────────────┘  │
│           ↓           ↓             │
│  ┌─────────────┐ ┌────────────┐   │
│  │  Frontend   │ │   Admin    │   │
│  │  (Static)   │ │  (Static)  │   │
│  │  React/Vite │ │ React/Vite │   │
│  └─────────────┘ └────────────┘   │
└─────────────────────────────────────┘
```

### Build Details

The Dockerfile uses multi-stage builds:

1. **Stage 1**: Build Frontend (Node.js)
2. **Stage 2**: Build Admin Panel (Node.js)
3. **Stage 3**: Build Go Backend
4. **Stage 4**: Final image with Alpine Linux
   - Copies Go binary
   - Copies built frontend static files
   - Copies built admin static files
   - Total size: ~50-100MB

### Resource Requirements

- **Minimum**: 512MB RAM, 0.5 CPU
- **Recommended**: 1GB RAM, 1 CPU
- **Disk**: ~500MB (includes image layers)

### Next Steps

1. ✅ Test locally with Docker
2. 📝 Configure environment variables
3. ☁️ Deploy to cloud platform (see [DEPLOYMENT.md](./DEPLOYMENT.md))
4. 🌐 Set up custom domain
5. 🔐 Configure CORS for production

### Support

For issues:
1. Check Docker logs: `docker logs victory-contest`
2. Verify environment variables
3. Ensure DynamoDB tables exist
4. Check AWS credentials and permissions

---

**Note**: This setup serves all three applications from a single container, making it perfect for small to medium deployments. For high-traffic production environments, consider separating the services.
