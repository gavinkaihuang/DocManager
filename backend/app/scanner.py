import os
import time
from sqlmodel import Session, select
from datetime import datetime
from .models import FileRecord, DirectoryConfig

import fnmatch

def load_ignore_patterns(root_path: str):
    ignore_file = os.path.join(root_path, '.docignore')
    patterns = []
    if os.path.exists(ignore_file):
        print(f"Loading ignore patterns from {ignore_file}")
        with open(ignore_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    patterns.append(line)
    return patterns

def is_ignored(name: str, patterns: list):
    for pattern in patterns:
        if fnmatch.fnmatch(name, pattern):
            return True
    return False

def scan_directory(directory_path: str, session: Session, config_id: int):
    # Basic rudimentary scan
    print(f"Scanning directory: {directory_path}")
    
    ignore_patterns = load_ignore_patterns(directory_path)
    
    existing_files = session.exec(select(FileRecord).where(FileRecord.directory_config_id == config_id)).all()
    existing_paths = {f.full_path for f in existing_files}
    
    found_paths = set()
    
    for root, dirs, files in os.walk(directory_path):
        # Filter directories in-place
        dirs[:] = [d for d in dirs if not is_ignored(d, ignore_patterns)]
        
        for filename in files:
            if is_ignored(filename, ignore_patterns):
                continue
                
            full_path = os.path.join(root, filename)
            found_paths.add(full_path)
            
            if full_path not in existing_paths:
                try:
                    stats = os.stat(full_path)
                    new_file = FileRecord(
                        filename=filename,
                        path=root,
                        full_path=full_path,
                        size_bytes=stats.st_size,
                        extension=os.path.splitext(filename)[1].lower(),
                        created_at=datetime.fromtimestamp(stats.st_ctime),
                        modified_at=datetime.fromtimestamp(stats.st_mtime),
                        directory_config_id=config_id
                    )
                    session.add(new_file)
                except OSError as e:
                    print(f"Error accessing {full_path}: {e}")

    # Remove files that no longer exist
    for file_record in existing_files:
        if file_record.full_path not in found_paths:
            session.delete(file_record)
            
    session.commit()
