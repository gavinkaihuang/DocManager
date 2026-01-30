import requests
import time
import os

BASE_URL = "http://localhost:8000"

def test_backend():
    print("Testing Backend...")
    
    # 1. Login
    print("1. Logging in...")
    login_data = {
        "username": "admin",
        "password": "admin"
    }
    response = requests.post(f"{BASE_URL}/token", data=login_data)
    assert response.status_code == 200, f"Login failed: {response.text}"
    token = response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print("   Login successful.")

    # 2. Create Test Directory and Files
    test_dir = os.path.abspath("test_scan_dir")
    os.makedirs(test_dir, exist_ok=True)
    with open(os.path.join(test_dir, "file1.txt"), "w") as f:
        f.write("content1")
    with open(os.path.join(test_dir, "file2.log"), "w") as f:
        f.write("content2")
    with open(os.path.join(test_dir, ".docignore"), "w") as f:
        f.write("*.log")
        
    print(f"2. Created test directory at {test_dir} with .docignore excluding *.log")

    # 3. Add Directory
    print("3. Adding directory to configuration...")
    # First check if exists/delete (cleanup from previous runs)
    dirs = requests.get(f"{BASE_URL}/directories/", headers=headers).json()
    for d in dirs:
        if d['path'] == test_dir:
            requests.delete(f"{BASE_URL}/directories/{d['id']}", headers=headers)
            
    response = requests.post(f"{BASE_URL}/directories/", params={"path": test_dir}, headers=headers)
    assert response.status_code == 200, f"Add directory failed: {response.text}"
    dir_id = response.json()["id"]
    print(f"   Directory added with ID {dir_id}. Scan triggered in background.")

    # 4. Wait for Scan
    print("4. Waiting for scan to complete...")
    time.sleep(2) 

    # Debug: List all directories
    all_dirs = requests.get(f"{BASE_URL}/directories/", headers=headers).json()
    print(f"   Configured Directories: {[d['path'] for d in all_dirs]}")

    # 5. Search for file1.txt (using search param to avoid pagination issues)
    print("5. Searching for file1.txt...")
    response = requests.get(f"{BASE_URL}/files/?search=file1.txt", headers=headers)
    assert response.status_code == 200
    files = response.json()["items"]
    filenames = [f['filename'] for f in files]
    print(f"   Found files matching 'file1.txt': {filenames}")
    
    assert "file1.txt" in filenames, f"file1.txt should be found. Found: {filenames}"
    
    # Check if file2.log is present
    response = requests.get(f"{BASE_URL}/files/?search=file2.log", headers=headers)
    files_log = response.json()["items"]
    log_filenames = [f['filename'] for f in files_log]
    assert "file2.log" not in log_filenames, f"file2.log should be ignored. Found: {log_filenames}"

    # 6. Test Pagination (on the search result or general)
    print("6. Testing Pagination...")
    print("6. Testing Pagination...")
    response = requests.get(f"{BASE_URL}/files/?limit=1", headers=headers)
    assert len(response.json()["items"]) == 1, "Limit should work"
    
    # 7. Test Delete (single)
    print("7. Testing Delete...")
    file_to_delete = next(f for f in files if f['filename'] == "file1.txt")
    response = requests.delete(f"{BASE_URL}/files/{file_to_delete['id']}", headers=headers)
    assert response.status_code == 200
    
    assert not os.path.exists(file_to_delete['full_path']), "File should be deleted from disk"
    print("   Delete successful.")
    
    # Cleanup
    requests.delete(f"{BASE_URL}/directories/{dir_id}", headers=headers)
    try:
        os.rmdir(test_dir)
    except:
        pass
    print("Test Complete: SUCCESS")

if __name__ == "__main__":
    test_backend()
