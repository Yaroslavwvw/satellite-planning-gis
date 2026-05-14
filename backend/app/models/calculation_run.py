from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CalculationRun(Base):
    __tablename__ = "calculation_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    aoi_id: Mapped[int] = mapped_column(ForeignKey("aois.id"), nullable=False, index=True)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(64), default="created", nullable=False)
    result_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    selected_satellites = relationship("CalculationRunSatellite", back_populates="calculation_run")
    observation_windows = relationship("ObservationWindow", back_populates="calculation_run")
