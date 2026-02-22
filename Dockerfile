FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built files and web interface
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web ./web
COPY --from=builder /app/node_modules ./node_modules

# Expose port (default: 3368, configured via PORT env var)
EXPOSE ${PORT:-3368}

# Set Node.js memory limit (can be overridden via NODE_OPTIONS env var)
ENV NODE_OPTIONS="--max-old-space-size=640"

# Start application
CMD ["node", "dist/src/main"]
