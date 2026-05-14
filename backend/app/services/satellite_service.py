from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.satellite import Satellite
from app.models.sensor import Sensor


def list_satellites(db: Session) -> list[Satellite]:
    return list(db.scalars(select(Satellite).order_by(Satellite.name)))


def get_satellite(db: Session, satellite_id: int) -> Satellite | None:
    return db.get(Satellite, satellite_id)


def list_satellite_sensors(db: Session, satellite_id: int) -> list[Sensor]:
    return list(db.scalars(select(Sensor).where(Sensor.satellite_id == satellite_id).order_by(Sensor.name)))
