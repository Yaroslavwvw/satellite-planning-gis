# from sqlalchemy import Float, ForeignKey, Integer, String
# from sqlalchemy.orm import Mapped, mapped_column, relationship

# from app.core.database import Base


# class Sensor(Base):
#     __tablename__ = "sensors"

#     id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
#     satellite_id: Mapped[int] = mapped_column(ForeignKey("satellites.id"), nullable=False, index=True)
#     name: Mapped[str] = mapped_column(String(255), nullable=False)
#     swath_km: Mapped[float | None] = mapped_column(Float, nullable=True)
#     resolution_m: Mapped[float | None] = mapped_column(Float, nullable=True)

#     satellite = relationship("Satellite", back_populates="sensors")
#     bands = relationship("SensorBand", back_populates="sensor")


from sqlalchemy import BigInteger, ForeignKey, Integer, Numeric, String, Text, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.sensor_mode import SensorMode
from app.models.sensor_band import SensorBand 

from app.core.database import Base


class Sensor(Base):
    __tablename__ = "sensors"

    sensor_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    satellite_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("satellites.satellite_id"),
        nullable=False,
        index=True,
    )

    modes: Mapped[list["SensorMode"]] = relationship(
        "SensorMode",
        back_populates="sensor",
        cascade="all, delete-orphan",
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sensor_type: Mapped[str] = mapped_column(String(100), nullable=False)
    swath_km: Mapped[float | None] = mapped_column(Numeric(8, 3), nullable=True)
    off_nadir_max_deg: Mapped[float | None] = mapped_column(Numeric(6, 3), nullable=True)
    retarget_time_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_access_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    data_access_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    max_off_nadir_deg: Mapped[float | None] = mapped_column(Float, nullable=True)

    satellite = relationship("Satellite", back_populates="sensors")
    bands = relationship("SensorBand", back_populates="sensor")

