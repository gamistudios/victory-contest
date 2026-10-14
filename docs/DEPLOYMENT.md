# Victory Contest Platform - Deployment Guide

This guide explains how to deploy the Victory Contest Platform (Backend + Frontend + Admin Panel) using Docker on various cloud platforms.

## 📦 What's Included

The Dockerfile builds and serves:
- **Backend API** (Go/Gin) on `/api/*`
- **Frontend** (React/Vite) on `/` (root)
- **Admin Panel** (React/Vite) on `/admin/*`

All three applications are served from a single container!

## 🚀 Quick Start - Local Testing

### Using Docker

```bash
# Build the image
docker build -t victory-contest .

# Run with environment variables
docker run -p 8080:8080 \
  -e JWT_SECRET="your-secret-key" \
  -e AWS_REGION="your-region" \
  -e AWS_ACCESS_KEY_ID="your-key" \
  -e AWS_SECRET_ACCESS_KEY="your-secret" \
  victory-contest
```

### Using Docker Compose

1. Copy your environment variables:
```bash
cp backend/.env.example .env
# Edit .env with your actual values
```

2. Start the container:
```bash
docker-compose up -d
```

3. Access the applications:
- Frontend: http://localhost:8080
- Admin Panel: http://localhost:8080/admin
- API: http://localhost:8080/api

## ☁️ Deploying to Cloud Platforms

### Option 1: Koyeb (Recommended)

#### Method A: Using Koyeb CLI

1. Install Koyeb CLI:
```bash
curl -fsSL https://cli.koyeb.com/install.sh | sh
```

2. Login:
```bash
koyeb login
```

3. Deploy:
```bash
koyeb app create victory-contest \
  --git github.com/your-username/victory-contest \
  --git-branch main \
  --docker-dockerfile Dockerfile \
  --ports 8080:http \
  --routes /:8080 \
  --env JWT_SECRET=your-secret-key \
  --env AWS_REGION=your-region \
  --env AWS_ACCESS_KEY_ID=your-key \
  --env AWS_SECRET_ACCESS_KEY=your-secret \
  --env QUESTION_TABLE=question \
  --env CONTEST_TABLE=contests \
  --env STUDENT_TABLE=student \
  --env SUBMISSION_TABLE=submissions \
  --env ADMIN_TABLE=admin \
  --env NOTIFICATION_TABLE=notification \
  --env ACHIEVEMENT_TABLE=achievement \
  --env CONTEST_REGISTRATION_TABLE=contest_registeration
```

#### Method B: Using Koyeb Web Interface

1. Go to [Koyeb Console](https://app.koyeb.com/)
2. Click **Create App**
3. Select **GitHub** and connect your repository
4. Configure:
   - **Builder**: Docker
   - **Dockerfile**: `Dockerfile`
   - **Port**: 8080
   - **Instance**: Nano (512MB) or higher recommended
5. Add environment variables (see Required Environment Variables section)
6. Click **Deploy**

### Option 2: Render

#### Method A: Using Render Blueprint (render.yaml)

Create a `render.yaml` file in your repository:

```yaml
services:
  - type: web
    name: victory-contest
    env: docker
    plan: starter
    dockerfilePath: ./Dockerfile
    envVars:
      - key: JWT_SECRET
        generateValue: true
      - key: AWS_REGION
        value: your-region
      - key: AWS_ACCESS_KEY_ID
        sync: false
      - key: AWS_SECRET_ACCESS_KEY
        sync: false
      - key: QUESTION_TABLE
        value: question
      - key: CONTEST_TABLE
        value: contests
      - key: STUDENT_TABLE
        value: student
      - key: SUBMISSION_TABLE
        value: submissions
      - key: ADMIN_TABLE
        value: admin
      - key: NOTIFICATION_TABLE
        value: notification
      - key: ACHIEVEMENT_TABLE
        value: achievement
      - key: CONTEST_REGISTRATION_TABLE
        value: contest_registeration
```

Then:
1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **New** → **Blueprint**
3. Connect your repository
4. Render will automatically detect `render.yaml` and deploy

#### Method B: Using Render Web Interface

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **New** → **Web Service**
3. Connect your repository
4. Configure:
   - **Environment**: Docker
   - **Instance Type**: Starter or higher
   - **Dockerfile Path**: `./Dockerfile`
5. Add environment variables
6. Click **Create Web Service**

### Option 3: Railway

1. Go to [Railway](https://railway.app/)
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your repository
4. Railway will auto-detect the Dockerfile
5. Add environment variables in the **Variables** tab
6. Deploy!

### Option 4: Fly.io

1. Install flyctl:
```bash
curl -L https://fly.io/install.sh | sh
```

2. Login:
```bash
fly auth login
```

3. Create a fly.toml file:
```bash
fly launch --no-deploy
```

4. Edit `fly.toml`:
```toml
app = "victory-contest"

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "8080"

[[services]]
  internal_port = 8080
  protocol = "tcp"

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]
```

5. Set secrets:
```bash
fly secrets set JWT_SECRET="your-secret" \
  AWS_REGION="your-region" \
  AWS_ACCESS_KEY_ID="your-key" \
  AWS_SECRET_ACCESS_KEY="your-secret"
```

6. Deploy:
```bash
fly deploy
```

## 🔐 Required Environment Variables

You must set these environment variables for the application to work:

### Essential
```bash
JWT_SECRET=your-long-random-secret-key
AWS_REGION=your-aws-region
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
```

### Database Tables (DynamoDB)
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

### Optional
```bash
CLOUDINARY_URL=cloudinary://...
GOOGLE_API_KEY=your-google-api-key
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_WEBHOOK_SECRET=your-webhook-secret
# Full public webhook URL; auto-registered via setWebhook at boot when set
# (getWebhookInfo is checked first, so restarts are a no-op)
TELEGRAM_WEBHOOK_URL=https://your-app.koyeb.app/api/telegram/webhook
# Public origin of the contest mini-app frontend (/start WebApp button)
FRONTEND_URL=https://victory-contest.vercel.app
CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://admin.yourdomain.com
ALLOW_DEV_AUTH=false
AI_REQUESTS_PER_MINUTE=30
```

## 🌐 CORS Configuration

For production, you **must** set `CORS_ALLOWED_ORIGINS` to your frontend domains:

```bash
CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://admin.yourdomain.com
```

If left empty, CORS will only allow localhost (development mode).

## 📝 Post-Deployment Steps

### 1. Update Frontend API URLs

If your frontend is configured with a hardcoded API URL, update it to point to your deployed backend:

**Frontend:** Check `frontend/src/config.ts` or environment variables
**Admin:** Check `admin-page/src/config.ts` or environment variables

### 2. Configure Custom Domain (Optional)

#### Koyeb:
1. Go to your app settings
2. Click **Domains**
3. Add your custom domain
4. Update DNS records as instructed

#### Render:
1. Go to your service settings
2. Click **Custom Domain**
3. Add your domain
4. Update DNS with provided CNAME

### 3. Set up HTTPS

Most platforms (Koyeb, Render, Railway, Fly.io) automatically provision SSL certificates. No action needed!

## 🔍 Accessing Your Applications

Once deployed, you can access:

- **Frontend**: `https://your-app.koyeb.app/`
- **Admin Panel**: `https://your-app.koyeb.app/admin`
- **API**: `https://your-app.koyeb.app/api`

## 🐛 Troubleshooting

### Build Fails

1. **Node.js version issues**: The Dockerfile uses Node 20. If you need a different version, update the `FROM node:20-alpine` line.

2. **Go version issues**: The Dockerfile uses Go 1.24. Update `FROM golang:1.24-alpine` if needed.

3. **npm install fails**: Try adding `--legacy-peer-deps` flag (already included in Dockerfile).

### Application Won't Start

1. **Check environment variables**: Ensure all required variables are set
2. **Check logs**: Use platform's log viewer
3. **JWT_SECRET missing**: This is required and will cause the app to crash

### Frontend Shows 404

1. The static files might not be copied correctly. Check Docker build logs.
2. Ensure the `NewRouter()` function in `backend/internal/handler/http/router.go` includes the static file serving code.

### API Returns CORS Errors

1. Set `CORS_ALLOWED_ORIGINS` environment variable to your frontend domain(s)
2. Format: `https://domain1.com,https://domain2.com` (no spaces, no trailing slashes)

## 💰 Cost Estimates

### Koyeb
- **Nano** (512MB RAM): Free tier available
- **Small** (1GB RAM): ~$7/month

### Render
- **Starter**: $7/month
- **Standard**: $25/month

### Railway
- Pay as you go: ~$5-20/month depending on usage
- Free $5 credit monthly

### Fly.io
- 3 VMs free (shared CPU, 256MB RAM)
- Additional resources billed by usage

## 📊 Recommended Resources

For this stack, minimum recommended resources:
- **RAM**: 512MB (1GB preferred)
- **CPU**: 0.5 vCPU minimum
- **Storage**: 10GB (mostly for Docker layers)

## 🔄 Updating Your Deployment

Most platforms support auto-deployment from Git:

1. Push changes to your repository
2. Platform detects changes and rebuilds automatically
3. New version is deployed with zero downtime

For manual deploys:
```bash
# Koyeb
koyeb app redeploy <app-name>

# Render
# Use the "Manual Deploy" button in dashboard

# Fly.io
fly deploy
```

## 📚 Additional Resources

- [Koyeb Documentation](https://www.koyeb.com/docs)
- [Render Documentation](https://render.com/docs)
- [Railway Documentation](https://docs.railway.app/)
- [Fly.io Documentation](https://fly.io/docs/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)

## 🆘 Need Help?

If you encounter issues:
1. Check the platform's logs
2. Verify all environment variables are set correctly
3. Ensure your AWS credentials have proper DynamoDB permissions
4. Check that all DynamoDB tables exist

---

**Note**: This deployment serves all three applications (Backend, Frontend, Admin) from a single container. For production at scale, you might want to separate them, but for most use cases, this setup is efficient and cost-effective.
