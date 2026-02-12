
from sqlmodel import Session, select
from app.database import engine, create_db_and_tables
from app.models import User
from app.auth import get_password_hash
import getpass

def reset_password(username: str, new_password: str):
    with Session(engine) as session:
        statement = select(User).where(User.username == username)
        user = session.exec(statement).first()
        
        if not user:
            print(f"User '{username}' not found. Creating user.")
            user = User(username=username, hashed_password=get_password_hash(new_password))
            session.add(user)
        else:
            print(f"User '{username}' found. Updating password.")
            user.hashed_password = get_password_hash(new_password)
            session.add(user)
            
        session.commit()
        session.refresh(user)
        print(f"Password for user '{username}' has been reset successfully.")

if __name__ == "__main__":
    print("Reset Password Tool")
    username = input("Enter username (default: admin): ").strip()
    if not username:
        username = "admin"
    
    password = getpass.getpass("Enter new password: ").strip()
    if not password:
        print("Password cannot be empty.")
        exit(1)
        
    confirm_password = getpass.getpass("Confirm new password: ").strip()
    if password != confirm_password:
        print("Passwords do not match.")
        exit(1)
        
    reset_password(username, password)
