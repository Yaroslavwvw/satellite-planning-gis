from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ObservationWindow(Base):
    __tablename__ = "observation_windows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    calculation_run_id: Mapped[int] = mapped_column(ForeignKey("calculation_runs.id"), nullable=False, index=True)
    satellite_id: Mapped[int] = mapped_column(ForeignKey("satellites.id"), nullable=False, index=True)
    start_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    track_geom: Mapped[object | None] = mapped_column(Geometry("LINESTRING", srid=4326), nullable=True)

    calculation_run = relationship("CalculationRun", back_populates="observation_windows")
