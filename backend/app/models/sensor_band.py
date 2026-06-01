# from sqlalchemy import Float, ForeignKey, Integer, String
# from sqlalchemy.orm import Mapped, mapped_column, relationship

# from app.core.database import Base


# class SensorBand(Base):
#     __tablename__ = "sensor_bands"

#     id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
#     sensor_id: Mapped[int] = mapped_column(ForeignKey("sensors.id"), nullable=False, index=True)
#     band_name: Mapped[str] = mapped_column(String(128), nullable=False)
#     min_wavelength_nm: Mapped[float | None] = mapped_column(Float, nullable=True)
#     max_wavelength_nm: Mapped[float | None] = mapped_column(Float, nullable=True)

#     sensor = relationship("Sensor", back_populates="bands")


from sqlalchemy import BigInteger, ForeignKey, Numeric, String, Boolean, Float,  Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship


from app.core.database import Base


class SensorBand(Base):
    __tablename__ = "sensor_bands"

    band_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    sensor_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("sensors.sensor_id"),
        nullable=False,
        index=True,
    )
    # band_name: Mapped[str] = mapped_column(String(100), nullable=False)
    spectral_range_nm: Mapped[str | None] = mapped_column(String(100), nullable=True)
    spatial_resolution_m: Mapped[float] = mapped_column(Numeric(8, 3), nullable=False)
    band_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    band_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    wavelength_min_nm: Mapped[float | None] = mapped_column(Float, nullable=True)
    wavelength_max_nm: Mapped[float | None] = mapped_column(Float, nullable=True)
    band_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_grouped: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    sensor = relationship("Sensor", back_populates="bands")