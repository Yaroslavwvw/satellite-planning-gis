from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Sensor(Base):
    __tablename__ = "sensors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    satellite_id: Mapped[int] = mapped_column(ForeignKey("satellites.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    swath_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    resolution_m: Mapped[float | None] = mapped_column(Float, nullable=True)

    satellite = relationship("Satellite", back_populates="sensors")
    bands = relationship("SensorBand", back_populates="sensor")
