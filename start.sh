
#!/bin/bash

# Configuration
BACKEND_PORT=8001
FRONTEND_PORT=5173
PROJECT_ROOT=$(pwd)

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting DocManager Services...${NC}"

# Start Backend
echo -e "${GREEN}Starting Backend on port $BACKEND_PORT...${NC}"
cd "$PROJECT_ROOT/backend"
../.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port $BACKEND_PORT &
BACKEND_PID=$!

# Start Frontend
echo -e "${GREEN}Starting Frontend on port $FRONTEND_PORT...${NC}"
cd "$PROJECT_ROOT/frontend"
npm run dev -- --host --port $FRONTEND_PORT &
FRONTEND_PID=$!

# Wait for processes
echo -e "${BLUE}Services started!${NC}"
echo -e "Backend: http://localhost:$BACKEND_PORT"
echo -e "Frontend: http://localhost:$FRONTEND_PORT"
echo -e "${BLUE}Press Ctrl+C to stop both services.${NC}"

trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait
