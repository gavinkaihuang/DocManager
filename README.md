# File Management System

A local file management system with scanning, indexing, filtering, and deletion capabilities.

## Tech Stack
- **Backend**: FastAPI, SQLModel (SQLite), Python-Multipart, Python-Jose
- **Frontend**: React, TypeScript, Vite

## Setup

1. **Backend**:
   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn app.main:app --reload
   ```
   Server runs at `http://localhost:8000`.

2. **Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   App runs at `http://localhost:5173`.

## Authentication
- Default User: `admin`
- Default Password: `admin`

## Features
- **Directory Management**: Add multiple directories to scan.
- **Ignoring Files**: Create a `.docignore` file in the root of any scanned directory to exclude patterns (e.g., `*.tmp`, `node_modules`).
- **File Operations**: Search, filter by extension, sort by size/name.
- **Bulk Delete**: Select multiple files and delete them (removes from disk and database).

## Resetting the Database
To completely reset the application state (users, directories, file index):
1. Stop the backend server.
2. Delete the `file_manager.db` file in the `backend` or root directory.
3. Restart the backend server. It will automatically recreate the database and the default `admin` user.
