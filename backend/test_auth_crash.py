from app.auth import verify_password, get_password_hash
try:
    print("Testing hash...")
    h = get_password_hash("test")
    print(f"Hash: {h}")
    print("Testing verify...")
    v = verify_password("test", h)
    print(f"Verify: {v}")
except Exception as e:
    print(f"Error: {e}")
