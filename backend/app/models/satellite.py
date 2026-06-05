from sqlalchemy import Integer, Numeric, String, Text, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Satellite(Base):
    __tablename__ = "satellites"

    satellite_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    norad_id: Mapped[int] = mapped_column(Integer, nullable=False, unique=True, index=True)
    object_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    mission_type: Mapped[str] = mapped_column(String(100), nullable=False)
    orbit_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    inclination_deg: Mapped[float | None] = mapped_column(Numeric(6, 3), nullable=True)
    orbital_period_min: Mapped[float | None] = mapped_column(Numeric(8, 3), nullable=True)
    avg_altitude_km: Mapped[float | None] = mapped_column(Numeric(8, 3), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_access_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    data_access_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    sensors = relationship("Sensor", back_populates="satellite")
    tle_records = relationship("TLERecord", back_populates="satellite")