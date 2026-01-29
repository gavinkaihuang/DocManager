# File Management System

A file management system that indexes files in specified directories, stores metadata in a database, and provides a web-based interface for management.

## Components

- **Backend**: Python (FastAPI, SQLModel, SQLite)
- **Frontend**: React (Vite, TypeScript, CSS)

## How to Run

### 1. Backend

1.  Navigate to the project root:
    ```bash
    cd /Users/gminihome/SourceCodes/DocMananger
    ```
2.  Install dependencies (if not already installed):
    ```bash
    pip install -r backend/requirements.txt
    ```
3.  Start the server:
    ```bash
    uvicorn backend.app.main:app --reload --port 8000
    ```

### 2. Frontend

1.  Navigate to the frontend directory:
    ```bash
    cd frontend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the development server:
    ```bash
    npm run dev
    ```

### 3. Access

Open your browser and navigate to: [http://localhost:5173](http://localhost:5173)

**Default Credentials:**
- **Username**: `admin`
- **Password**: `admin`

## Database Migration / Initialization

The system uses **SQLite** (`file_manager.db`).

### Automatic Initialization
When you run the backend for the first time on a new system (`uvicorn backend.app.main:app ...`), it will **automatically**:
1.  Create the `file_manager.db` file if it doesn't exist.
2.  Create all necessary tables.
3.  Create the default `admin` user.

### Resetting the Database
To start fresh (wipe all data):
1.  Stop the backend server.
2.  Delete the `file_manager.db` file found in the project root.
3.  Restart the backend server. A new, empty database will be created.
