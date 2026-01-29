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
