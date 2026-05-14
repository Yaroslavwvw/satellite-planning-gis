from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.tle import TLEUpdateRequest, TLEUpdateResponse
from app.services.tle_loader import parse_tle_lines, read_satellites_for_update, request_tle_by_norad, save_tle_record

router = APIRouter(prefix="/api/tle", tags=["tle"])


@router.post("/update", response_model=TLEUpdateResponse)
async def update_tle(payload: TLEUpdateRequest, db: Session = Depends(get_db)):
    satellites = read_satellites_for_update(db, payload.satellite_ids)
    details: list[str] = []
    updated = 0

    for satellite in satellites:
        try:
            raw_tle = await request_tle_by_norad(satellite.norad_id)
            parsed = parse_tle_lines(raw_tle)
            if parsed is None:
                details.append(f"{satellite.name}: invalid TLE format")
                continue
            save_tle_record(db, satellite.id, parsed)
            updated += 1
            details.append(f"{satellite.name}: updated")
        except Exception as exc:  # safe skeleton, detailed handling can be refined later
            details.append(f"{satellite.name}: failed ({exc.__class__.__name__})")

    db.commit()
    return TLEUpdateResponse(updated_records=updated, details=details)
