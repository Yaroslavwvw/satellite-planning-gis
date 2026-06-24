from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.satellite import Satellite
from app.models.tle_record import TLERecord
from app.schemas.orbit import SatelliteTrackResponse
from app.services.orbit_service import generate_satellite_track

router = APIRouter(prefix="/api/orbits", tags=["orbits"])


@router.get("/satellites/{satellite_id}/track", response_model=SatelliteTrackResponse)
def get_satellite_track(
    satellite_id: int,
    start_time: datetime = Query(...),
    end_time: datetime = Query(...),
    step_seconds: int = Query(default=60, gt=0),
    db: Session = Depends(get_db),
):
    satellite = db.get(Satellite, satellite_id)

    if satellite is None:
        raise HTTPException(status_code=404, detail="Satellite not found")

    current_tle = db.scalar(
        select(TLERecord)
        .where(TLERecord.satellite_id == satellite.satellite_id)
        .where(TLERecord.is_current.is_(True))
    )

    if current_tle is None:
        raise HTTPException(
            status_code=400,
            detail=f"No current TLE for satellite {satellite.name}",
        )

    try:
        track = generate_satellite_track(
            satellite_name=satellite.name,
            line1=current_tle.line1,
            line2=current_tle.line2,
            start_time=start_time,
            end_time=end_time,
            step_seconds=step_seconds,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return SatelliteTrackResponse(
        satellite_id=satellite.satellite_id,
        satellite_name=satellite.name,
        norad_id=satellite.norad_id,
        start_time=start_time,
        end_time=end_time,
        step_seconds=step_seconds,
        points_count=len(track),
        track=track,
    )