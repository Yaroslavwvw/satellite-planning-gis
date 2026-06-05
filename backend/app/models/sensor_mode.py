from sqlalchemy import Boolean, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SensorMode(Base):
    __tablename__ = "sensor_modes"

    sensor_mode_id: Mapped[int] = mapped_column(primary_key=True, index=True)
    sensor_id: Mapped[int] = mapped_column(
        ForeignKey("sensors.sensor_id"),
        nullable=False,
    )

    mode_name: Mapped[str] = mapped_column(String(100), nullable=False)
    mode_type: Mapped[str | None] = mapped_column(String(50), nullable=True)

    swath_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    spatial_resolution_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_off_nadir_deg: Mapped[float | None] = mapped_column(Float, nullable=True)

    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    sensor = relationship("Sensor", back_populates="modes")