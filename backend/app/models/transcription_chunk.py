from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from . import Base


class TranscriptionChunk(Base):
    __tablename__ = "transcription_chunks"

    id = Column(Integer, primary_key=True, index=True)
    episode_id = Column(Integer, ForeignKey("episodes.id"))
    content = Column(Text, nullable=False)
    created_at = Column(DateTime)
