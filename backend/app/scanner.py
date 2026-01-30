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

import json

def scan_directory_generator(directory_path: str, session: Session, config_id: int):
    # Basic rudimentary scan
    yield json.dumps({"type": "start", "message": f"Scanning directory: {directory_path}"}) + "\n"
    
    ignore_patterns = load_ignore_patterns(directory_path)
    
    existing_files = session.exec(select(FileRecord).where(FileRecord.directory_config_id == config_id)).all()
    existing_paths = {f.full_path for f in existing_files}
    
    found_paths = set()
    scanned_count = 0
    added_count = 0
    
    for root, dirs, files in os.walk(directory_path):
        # Filter directories in-place
        dirs[:] = [d for d in dirs if not is_ignored(d, ignore_patterns)]
        
        for filename in files:
            if is_ignored(filename, ignore_patterns):
                continue
                
            full_path = os.path.join(root, filename)
            found_paths.add(full_path)
            scanned_count += 1
            
            # Yield progress every 10 files or so to avoid flooding, or every file if we want smooth bar
            if scanned_count % 5 == 0:
                yield json.dumps({"type": "progress", "count": scanned_count, "file": filename}) + "\n"
            
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
                    added_count += 1
                except OSError as e:
                    print(f"Error accessing {full_path}: {e}")

    # Remove files that no longer exist
    deleted_count = 0
    for file_record in existing_files:
        if file_record.full_path not in found_paths:
            session.delete(file_record)
            deleted_count += 1
            
    session.commit()
    yield json.dumps({
        "type": "complete", 
        "total_scanned": scanned_count, 
        "added": added_count, 
        "deleted": deleted_count
    }) + "\n"

# Wrapper for background tasks (backward compatibility if needed, though we moved to streaming)
def scan_directory(directory_path: str, session: Session, config_id: int):
    # Consume the generator
    for _ in scan_directory_generator(directory_path, session, config_id):
        pass
