from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TLERecord(Base):
    __tablename__ = "tle_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    satellite_id: Mapped[int] = mapped_column(ForeignKey("satellites.id"), nullable=False, index=True)
    line1: Mapped[str] = mapped_column(String(128), nullable=False)
    line2: Mapped[str] = mapped_column(String(128), nullable=False)
    source: Mapped[str] = mapped_column(String(64), default="celestrak", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    satellite = relationship("Satellite", back_populates="tle_records")
