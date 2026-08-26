import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker

from app.config import settings

# Ensure data directory exists for SQLite
db_path = settings.logistics_db_url.replace("sqlite:///", "")
if db_path.startswith("./"):
    db_path = db_path[2:]
if os.path.dirname(db_path):
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

engine_args = {}
if settings.logistics_db_url.startswith("sqlite"):
    engine_args["connect_args"] = {"check_same_thread": False}

engine = create_engine(
    settings.logistics_db_url,
    **engine_args
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
