from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SensorBand(Base):
    __tablename__ = "sensor_bands"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sensor_id: Mapped[int] = mapped_column(ForeignKey("sensors.id"), nullable=False, index=True)
    band_name: Mapped[str] = mapped_column(String(128), nullable=False)
    min_wavelength_nm: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_wavelength_nm: Mapped[float | None] = mapped_column(Float, nullable=True)

    sensor = relationship("Sensor", back_populates="bands")
