# SyncStream

Professional synchronized media streaming platform.

## Docker Setup

### Development

```bash
# Start development environment
docker-compose -f docker-compose.dev.yml up --build

# Stop
docker-compose -f docker-compose.dev.yml down
```

**Ports:**
- Frontend: http://localhost:4080
- Backend: http://localhost:4001

### Production

```bash
# Copy environment file
cp .env.example .env

# Edit .env with your values
nano .env

# Start production stack
docker-compose up -d --build
```

## Local Development (without Docker)

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server && npm install && cd ..

# Start backend
cd server && npm run dev

# Start frontend (new terminal)
npm run dev
```
