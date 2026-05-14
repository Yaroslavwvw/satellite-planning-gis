from sqlalchemy import ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CalculationRunSatellite(Base):
    __tablename__ = "calculation_run_satellites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    calculation_run_id: Mapped[int] = mapped_column(ForeignKey("calculation_runs.id"), nullable=False, index=True)
    satellite_id: Mapped[int] = mapped_column(ForeignKey("satellites.id"), nullable=False, index=True)

    calculation_run = relationship("CalculationRun", back_populates="selected_satellites")
