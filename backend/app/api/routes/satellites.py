from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.satellite import SatelliteRead, SensorRead
from app.services.satellite_service import get_satellite, list_satellite_sensors, list_satellites

router = APIRouter(prefix="/api/satellites", tags=["satellites"])


@router.get("", response_model=list[SatelliteRead])
def get_satellites(db: Session = Depends(get_db)):
    return list_satellites(db)


@router.get("/{satellite_id}", response_model=SatelliteRead)
def get_satellite_by_id(satellite_id: int, db: Session = Depends(get_db)):
    satellite = get_satellite(db, satellite_id)
    if satellite is None:
        raise HTTPException(status_code=404, detail="Satellite not found")
    return satellite


@router.get("/{satellite_id}/sensors", response_model=list[SensorRead])
def get_satellite_sensors(satellite_id: int, db: Session = Depends(get_db)):
    if get_satellite(db, satellite_id) is None:
        raise HTTPException(status_code=404, detail="Satellite not found")
    return list_satellite_sensors(db, satellite_id)
