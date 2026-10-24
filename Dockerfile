# Build stage
FROM node:22-alpine AS builder

WORKDIR /app
 
# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY eslint.config.js ./
COPY tsconfig.node.json ./
COPY .env ./
# Install dependencies
RUN npm ci --no-audit --no-fund

# Copy source files
COPY src ./src
COPY public ./public
COPY index.html ./

# Build the application with production environment
RUN npm run build

# Runtime stage
FROM node:22-alpine

WORKDIR /app

# Install a simple HTTP server to serve the built app
RUN npm install -g serve

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S appuser -u 1001

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Change ownership to non-root user
RUN chown -R appuser:nodejs /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start the application
CMD ["serve", "-s", "dist", "-l", "3000"]