from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select
from typing import List

from .database import create_db_and_tables, get_session, engine
from .models import User, DirectoryConfig, FileRecord, CreateDirectoryRequest
from .auth import get_current_user, create_access_token, get_password_hash, verify_password, ACCESS_TOKEN_EXPIRE_MINUTES
from .scanner import scan_directory
from datetime import timedelta
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    
    # Trigger scan in background
    background_tasks.add_task(scan_directory, path, session, new_dir.id)
    
    return new_dir

@app.get("/directories/", response_model=List[DirectoryConfig])
async def get_directories(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return session.exec(select(DirectoryConfig)).all()

@app.delete("/directories/{dir_id}")
async def delete_directory(dir_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    dir_config = session.get(DirectoryConfig, dir_id)
    if not dir_config:
        raise HTTPException(status_code=404, detail="Directory not found")
    
    # Delete associated files first (cascade would be better in DB schema but this works)
    files = session.exec(select(FileRecord).where(FileRecord.directory_config_id == dir_id)).all()
    for f in files:
        session.delete(f)
        
    session.delete(dir_config)
    session.commit()
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
    current_user: User = Depends(get_current_user), 
    session: Session = Depends(get_session)
):
    conditions = []
    if search:
        conditions.append(FileRecord.filename.contains(search))
    if extension:
        conditions.append(FileRecord.extension == extension)

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
    
    try:
        if os.path.exists(file_record.full_path):
            os.remove(file_record.full_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete file from disk: {e}")
        
    session.delete(file_record)
    session.commit()
    return {"ok": True}

@app.post("/files/delete")
async def delete_files_bulk(request: DeleteFilesRequest, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    files = session.exec(select(FileRecord).where(FileRecord.id.in_(request.file_ids))).all()
    
    deleted_count = 0
    for file_record in files:
        try:
            if os.path.exists(file_record.full_path):
                os.remove(file_record.full_path)
            session.delete(file_record)
            deleted_count += 1
        except Exception as e:
            print(f"Failed to delete {file_record.full_path}: {e}")
            
    session.commit()
    return {"deleted_count": deleted_count}

@app.post("/scan/{dir_id}")
async def rescan_directory(dir_id: int, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    dir_config = session.get(DirectoryConfig, dir_id)
    if not dir_config:
        raise HTTPException(status_code=404, detail="Directory not found")
        
    background_tasks.add_task(scan_directory, dir_config.path, session, dir_id)
    return {"message": "Scan started"}
