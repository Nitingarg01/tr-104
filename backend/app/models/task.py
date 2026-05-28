from sqlalchemy import Column, Integer, String, DateTime, Boolean
from . import Base


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    status = Column(String(32), default="pending")
    created_at = Column(DateTime)
    completed_at = Column(DateTime, nullable=True)
    is_async = Column(Boolean, default=False)
