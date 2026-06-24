from sqlalchemy import BigInteger, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CalculationRunSatellite(Base):
    __tablename__ = "calculation_run_satellites"

    calculation_run_satellite_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        index=True,
    )
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
    tle_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("tle_records.tle_id"),
        nullable=False,
        index=True,
    )
    included_manually: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    calculation_run = relationship("CalculationRun", back_populates="selected_satellites")