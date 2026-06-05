from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.satellite import Satellite
from app.models.sensor import Sensor


def list_satellites(db: Session):
    return list(
        db.scalars(
            select(Satellite).order_by(Satellite.name)
        )
    )


def get_satellite(db: Session, satellite_id: int) -> Satellite | None:
    return db.get(Satellite, satellite_id)


def list_satellite_sensors(db: Session, satellite_id: int):
    return list(
        db.scalars(
            select(Sensor)
            .where(Sensor.satellite_id == satellite_id)
            .options(
                selectinload(Sensor.bands),
                selectinload(Sensor.modes),
            )
            .order_by(Sensor.name)
        )
    )