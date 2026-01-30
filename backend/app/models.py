from datetime import datetime
from typing import Optional, List
from sqlmodel import Field, SQLModel

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    hashed_password: str
    is_active: bool = Field(default=True)

class DirectoryConfig(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    path: str = Field(unique=True, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

class FileRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    filename: str
    path: str = Field(index=True)
    full_path: str = Field(unique=True)
    size_bytes: int
    extension: str
    created_at: datetime
    modified_at: datetime
    directory_config_id: Optional[int] = Field(default=None, foreign_key="directoryconfig.id")

class FilesResponse(SQLModel):
    items: List[FileRecord]
    total: int

class DeleteFilesRequest(SQLModel):
    file_ids: List[int]

class CreateDirectoryRequest(SQLModel):
    path: str

class DeletionLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    username: str
    action_type: str  # "single", "bulk", "directory"
    target_path: Optional[str] = None # For single/directory delete
    file_count: int
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class DeletionLogItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    deletion_log_id: int = Field(foreign_key="deletionlog.id")
    filename: str
    full_path: str
    size_bytes: int
