from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select
from typing import List

from .database import create_db_and_tables, get_session, engine
from .models import User, DirectoryConfig, FileRecord, CreateDirectoryRequest, DeletionLog, DeletionLogItem
from .auth import get_current_user, create_access_token, get_password_hash, verify_password, ACCESS_TOKEN_EXPIRE_MINUTES
from .scanner import scan_directory
from datetime import timedelta
import os

app = FastAPI()

import logging
# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("file_manager.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    # logger.info(f"Incoming request: {request.method} {request.url}")
    # logger.info(f"Headers: {request.headers}")
    response = await call_next(request)
    return response

@app.on_event("startup")
def on_startup():
    create_db_and_tables()
    # Create initial user if not exists (admin/admin)
    with Session(engine) as session:
        statement = select(User).where(User.username == "admin")
        user = session.exec(statement).first()
        if not user:
            hashed_pwd = get_password_hash("admin")
            admin_user = User(username="admin", hashed_password=hashed_pwd)
            session.add(admin_user)
            session.commit()

# Authentication
@app.post("/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    statement = select(User).where(User.username == form_data.username)
    user = session.exec(statement).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

# Directory Management
@app.post("/directories/")
async def add_directory(request: CreateDirectoryRequest, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    path = request.path
    if not os.path.isdir(path):
         raise HTTPException(status_code=400, detail="Invalid directory path")
    
    existing = session.exec(select(DirectoryConfig).where(DirectoryConfig.path == path)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Directory already configured")
        
    new_dir = DirectoryConfig(path=path)
    session.add(new_dir)
    session.commit()
    session.refresh(new_dir)
    
    # Do not trigger background scan here, let frontend initiate interactive scan
    # background_tasks.add_task(scan_directory, path, session, new_dir.id)
    
    return new_dir

@app.get("/directories/", response_model=List[DirectoryConfig])
async def get_directories(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return session.exec(select(DirectoryConfig)).all()

@app.delete("/directories/{dir_id}")
async def delete_directory(dir_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    dir_config = session.get(DirectoryConfig, dir_id)
    if not dir_config:
        raise HTTPException(status_code=404, detail="Directory not found")
    
    logger.info(f"User '{current_user.username}' attempting to delete directory: {dir_config.path} (ID: {dir_id})")

    # Delete associated files first (cascade would be better in DB schema but this works)
    files = session.exec(select(FileRecord).where(FileRecord.directory_config_id == dir_id)).all()
    for f in files:
        try:
            session.delete(f)
            logger.info(f"Deleted associated file record: {f.full_path}")
        except Exception as e:
            logger.error(f"Failed to delete associated file record {f.full_path} for directory {dir_config.path}. Error: {e}")
        
    session.delete(dir_config)
    session.commit()
    logger.info(f"Successfully deleted directory: {dir_config.path} and {len(files)} associated file records.")
    return {"ok": True}

from .models import User, DirectoryConfig, FileRecord, FilesResponse, DeleteFilesRequest, CreateDirectoryRequest
from sqlalchemy import func

# ... (rest of imports)

@app.get("/files/", response_model=FilesResponse)
async def get_files(
    skip: int = 0, 
    limit: int = 150, 
    search: str = None, 
    extension: str = None,
    sort_by: str = None,
    order: str = "asc",
    directory_id: int = None,
    min_size: int = None,
    max_size: int = None,
    current_user: User = Depends(get_current_user), 
    session: Session = Depends(get_session)
):
    conditions = []
    if search:
        conditions.append(FileRecord.filename.contains(search))
    if extension:
        conditions.append(FileRecord.extension == extension)
    if directory_id:
        conditions.append(FileRecord.directory_config_id == directory_id)
    if min_size is not None:
        conditions.append(FileRecord.size_bytes >= min_size)
    if max_size is not None:
        conditions.append(FileRecord.size_bytes <= max_size)

    # Count
    count_query = select(func.count()).select_from(FileRecord)
    if conditions:
        count_query = count_query.where(*conditions)
    total = session.exec(count_query).one()

    # Main Query
    query = select(FileRecord)
    if conditions:
        query = query.where(*conditions)

    if sort_by:
        field = getattr(FileRecord, sort_by, None)
        if field:
            if order == "desc":
                query = query.order_by(field.desc())
            else:
                query = query.order_by(field.asc())
        
    query = query.offset(skip).limit(limit)
    items = session.exec(query).all()
    
    return FilesResponse(items=items, total=total)

@app.delete("/files/{file_id}")
async def delete_file(file_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    file_record = session.get(FileRecord, file_id)
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    logger.info(f"User '{current_user.username}' attempting to delete file: {file_record.full_path}")

    try:
        if os.path.exists(file_record.full_path):
            os.remove(file_record.full_path)
    except Exception as e:
        logger.error(f"Failed to delete file from disk: {file_record.full_path}. Error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete file from disk: {e}")
        
    session.delete(file_record)
    session.commit()
    logger.info(f"Successfully deleted file: {file_record.full_path}")

    # Audit Log
    try:
        log_entry = DeletionLog(
            user_id=current_user.id,
            username=current_user.username,
            action_type="single",
            target_path=file_record.full_path,
            file_count=1
        )
        session.add(log_entry)
        session.commit()
        session.refresh(log_entry)
        
        log_item = DeletionLogItem(
            deletion_log_id=log_entry.id,
            filename=file_record.filename,
            full_path=file_record.full_path,
            size_bytes=file_record.size_bytes
        )
        session.add(log_item)
        session.commit()
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")

    return {"ok": True}

@app.post("/files/delete")
async def delete_files_bulk(request: DeleteFilesRequest, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    files = session.exec(select(FileRecord).where(FileRecord.id.in_(request.file_ids))).all()
    
    files_to_delete = [f.full_path for f in files]
    logger.info(f"User '{current_user.username}' attempting to bulk delete {len(files)} files: {files_to_delete}")
    
    deleted_count = 0
    for file_record in files:
        try:
            if os.path.exists(file_record.full_path):
                os.remove(file_record.full_path)
            session.delete(file_record)
            deleted_count += 1
        except Exception as e:
            logger.error(f"Failed to delete {file_record.full_path}: {e}")
            
    session.commit()
    logger.info(f"Bulk delete completed. Requested: {len(files)}, Deleted: {deleted_count}")

    # Audit Log
    if deleted_count > 0:
        try:
            log_entry = DeletionLog(
                user_id=current_user.id,
                username=current_user.username,
                action_type="bulk",
                target_path=None,
                file_count=deleted_count
            )
            session.add(log_entry)
            session.commit()
            session.refresh(log_entry)
            
            for file_record in files:
                log_item = DeletionLogItem(
                    deletion_log_id=log_entry.id,
                    filename=file_record.filename,
                    full_path=file_record.full_path,
                    size_bytes=file_record.size_bytes
                )
                session.add(log_item)
            session.commit()
        except Exception as e:
            logger.error(f"Failed to write audit log: {e}")

    return {"deleted_count": deleted_count}

from fastapi.responses import StreamingResponse
from .scanner import scan_directory, scan_directory_generator

@app.post("/scan/{dir_id}")
async def rescan_directory(dir_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    dir_config = session.get(DirectoryConfig, dir_id)
    if not dir_config:
        raise HTTPException(status_code=404, detail="Directory not found")
        
    return StreamingResponse(
        scan_directory_generator(dir_config.path, session, dir_id),
        media_type="application/x-ndjson"
    )

@app.get("/logs")
async def get_logs(current_user: User = Depends(get_current_user)):
    log_file_path = "file_manager.log"
    if not os.path.exists(log_file_path):
        return {"logs": "No logs found."}
    
    try:
        with open(log_file_path, "r") as f:
            # Read all lines and keep last 1000
            lines = f.readlines()
            return {"logs": "".join(lines[-1000:])}
    except Exception as e:
        return {"logs": f"Error reading logs: {e}"}

from typing import List, Dict, Any

@app.get("/audit/deletions")
async def get_deletion_history(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    # Returns last 50 deletions
    logs = session.exec(select(DeletionLog).order_by(DeletionLog.timestamp.desc()).limit(50)).all()
    
    # Enrich with items? Or fetch items on demand? Let's fetch details including items for simplicity or separate call
    # For now, let's return logs and let frontend ask for details if needed, OR return nested.
    # SQLModel relationships are async/lazy sometimes. Let's just do manual join or separate endpoint.
    
    # Let's return the logs first.
    return logs

@app.get("/audit/deletions/{log_id}/items")
async def get_deletion_log_items(log_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    items = session.exec(select(DeletionLogItem).where(DeletionLogItem.deletion_log_id == log_id)).all()
    return items
