# Docker Setup Guide - Asset Management System

## Overview

This guide provides instructions for containerizing and running the Asset Management System using Docker.

## Prerequisites

- Docker installed (https://www.docker.com/products/docker-desktop)
- Docker Compose installed (usually comes with Docker Desktop)
- Git (for cloning the repository)

## Files Included

- **Dockerfile** - Production multi-stage build configuration for the React app
- **docker-compose.yml** - Production deployment configuration
- **docker-compose.dev.yml** - Development configuration with live reload support
- **functions/Dockerfile** - Optional Cloud Functions containerization
- **.dockerignore** - Files excluded from the Docker build context

## Quick Start - Production

### Build and Run with Docker Compose

```bash
# Navigate to the assetmgmt directory
cd assetmgmt

# Build the image and start the container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the container
docker-compose down
```

The application will be available at `http://localhost:3000`

### Manual Docker Build

```bash
cd assetmgmt

# Build the image
docker build -t asset-management:latest .

# Run the container
docker run -d \
  --name asset-management-app \
  -p 3000:3000 \
  --restart unless-stopped \
  asset-management:latest

# View logs
docker logs -f asset-management-app

# Stop the container
docker stop asset-management-app
docker rm asset-management-app
```

## Development Setup

### Build and Run with Development Compose

```bash
cd assetmgmt

# Start in development mode with hot reload
docker-compose -f docker-compose.dev.yml up

# The app will rebuild automatically when source files change
```

### Benefits of Development Setup

- Hot module reloading (changes reflect immediately)
- Access to all development tools
- Direct access to source code through volumes

## Docker Image Details

### Production Image

- **Base Image**: node:20-alpine (small footprint ~160MB)
- **Build Stage**: Compiles TypeScript and builds Vite bundle
- **Runtime Stage**: Minimal image with only production dependencies
- **Size**: ~180-200MB (final image)

### Multi-Stage Build Advantages

- ✅ Smaller final image (builder stage not included)
- ✅ Faster deployment
- ✅ Better security (dev dependencies not in production)
- ✅ Optimized for CI/CD pipelines

## Environment Variables

Create a `.env` file in the `assetmgmt` directory if needed:

```env
NODE_ENV=production
# Firebase configuration is embedded in the app at build time
```

## Health Checks

The container includes a built-in health check that:
- Runs every 30 seconds
- Times out after 10 seconds
- Retries up to 3 times
- Wait 5-10 seconds before starting checks

Check container health:
```bash
docker ps
# Look for "healthy" or "unhealthy" status

# Or check logs
docker inspect asset-management-app | grep -A 5 Health
```

## Port Mapping

- **Default Port**: 3000
- **To use a different port**: Update the port mapping in docker-compose.yml or the docker run command
  ```bash
  docker run -p 8080:3000 asset-management:latest
  ```

## Pushing to Container Registry

### Docker Hub

```bash
# Tag the image
docker tag asset-management:latest yourusername/asset-management:latest

# Login to Docker Hub
docker login

# Push the image
docker push yourusername/asset-management:latest
```

### Other Registries (Azure, AWS, GCP)

Consult your registry provider's documentation for login and push instructions.

## Kubernetes Deployment

For Kubernetes deployment, create a deployment manifest:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: asset-management
spec:
  replicas: 2
  selector:
    matchLabels:
      app: asset-management
  template:
    metadata:
      labels:
        app: asset-management
    spec:
      containers:
      - name: app
        image: asset-management:latest
        ports:
        - containerPort: 3000
        livenessProbe:
          httpGet:
            path: /
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: asset-management-service
spec:
  selector:
    app: asset-management
  type: LoadBalancer
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
```

## Cloud Functions Docker (Optional)

The Cloud Functions can be containerized separately for local testing:

```bash
cd assetmgmt/functions

# Build
docker build -t asset-management-functions:latest .

# Run
docker run -p 5001:5001 asset-management-functions:latest
```

**Note**: Firebase Cloud Functions are best deployed to Firebase directly. This Docker setup is for local development and testing only.

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs asset-management-app

# Rebuild without cache
docker build --no-cache -t asset-management:latest .
```

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Use different port
docker run -p 8080:3000 asset-management:latest
```

### Out of Space

```bash
# Clean up unused images and containers
docker system prune

# Full cleanup (be careful!)
docker system prune -a
```

### Firebase Connection Issues

- Ensure Firebase configuration is correct in `src/config/firebase.ts`
- Firebase credentials are embedded at build time
- The container needs internet access to reach Firebase

## Performance Tips

1. **Use Alpine Linux images** - Already configured (60% smaller)
2. **Multi-stage builds** - Already configured (production-optimized)
3. **Layer caching** - Copy package.json before source code
4. **Health checks** - Already configured for orchestration systems

## Security Best Practices

- ✅ Use specific Node.js version (not `latest`)
- ✅ Run as non-root user (Alpine's default)
- ✅ Minimal dependencies in final image
- ✅ No source code in production image
- ✅ .dockerignore excludes sensitive files

## Next Steps

1. Build the image: `docker build -t asset-management:latest assetmgmt/`
2. Test locally: `docker run -p 3000:3000 asset-management:latest`
3. Push to registry for team/production use
4. Deploy using Docker Compose, Kubernetes, or cloud platform

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [Best Practices for Node.js in Docker](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)
- [Alpine Linux](https://alpinelinux.org/)
