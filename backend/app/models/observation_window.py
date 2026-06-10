from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, Numeric
from sqlalchemy import Float, Integer, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ObservationWindow(Base):
    __tablename__ = "observation_windows"

    window_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    calculation_run_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("calculation_runs.calculation_run_id"),
        nullable=False,
        index=True,
    )
    satellite_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("satellites.satellite_id"),
        nullable=False,
        index=True,
    )
    sensor_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("sensors.sensor_id"),
        nullable=False,
        index=True,
    )
    aoi_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("aois.aoi_id"),
        nullable=False,
        index=True,
    )
    access_start: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    access_end: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    duration_sec: Mapped[int] = mapped_column(Integer, nullable=False)
    max_elevation_deg: Mapped[float | None] = mapped_column(Numeric(6, 3), nullable=True)
    off_nadir_deg: Mapped[float | None] = mapped_column(Numeric(6, 3), nullable=True)
    observation_score: Mapped[float | None] = mapped_column(Numeric(8, 3), nullable=True)
    coverage_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    sun_elevation_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_daylight: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    daylight_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    max_off_nadir_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    required_off_nadir_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    requires_pointing: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reachable_coverage_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    sensor_mode_id: Mapped[int | None] = mapped_column(
        ForeignKey("sensor_modes.sensor_mode_id", ondelete="SET NULL"),
        nullable=True,
    )
    

    swath_km: Mapped[float | None] = mapped_column(Float, nullable=True)

    calculation_run = relationship("CalculationRun", back_populates="observation_windows")