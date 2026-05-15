from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CalculationRun(Base):
    __tablename__ = "calculation_runs"

    calculation_run_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    aoi_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("aois.aoi_id"),
        nullable=False,
        index=True,
    )
    period_start: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    step_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    mode: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="created")
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    aoi = relationship("AOI", back_populates="calculation_runs")
    selected_satellites = relationship(
        "CalculationRunSatellite",
        back_populates="calculation_run",
        cascade="all, delete-orphan",
    )
    observation_windows = relationship(
        "ObservationWindow",
        back_populates="calculation_run",
        cascade="all, delete-orphan",
    )