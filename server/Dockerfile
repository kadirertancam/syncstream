# SyncStream Backend Dockerfile
# ===============================

FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install dependencies for health checks
RUN apk add --no-cache curl

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start server
CMD ["node", "index.js"]
