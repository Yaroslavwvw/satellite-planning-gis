# from datetime import datetime

# from sqlalchemy import DateTime, ForeignKey, Integer, String
# from sqlalchemy.orm import Mapped, mapped_column, relationship

# from app.core.database import Base


# class TLERecord(Base):
#     __tablename__ = "tle_records"

#     id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
#     satellite_id: Mapped[int] = mapped_column(ForeignKey("satellites.id"), nullable=False, index=True)
#     line1: Mapped[str] = mapped_column(String(128), nullable=False)
#     line2: Mapped[str] = mapped_column(String(128), nullable=False)
#     source: Mapped[str] = mapped_column(String(64), default="celestrak", nullable=False)
#     created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

#     satellite = relationship("Satellite", back_populates="tle_records")


from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TLERecord(Base):
    __tablename__ = "tle_records"

    tle_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    satellite_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("satellites.satellite_id"),
        nullable=False,
        index=True,
    )
    line1: Mapped[str] = mapped_column(String(255), nullable=False)
    line2: Mapped[str] = mapped_column(String(255), nullable=False)
    epoch_utc: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    source_name: Mapped[str] = mapped_column(String(100), nullable=False, default="CelesTrak")
    fetched_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    satellite = relationship("Satellite", back_populates="tle_records")