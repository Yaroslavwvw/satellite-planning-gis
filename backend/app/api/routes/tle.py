from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.tle import (
    TLEStatusResponse,
    TLEUpdateRequest,
    TLEUpdateResponse,
)
from app.services.tle_loader import (
    get_tle_catalog_status,
    is_tle_update_in_progress,
    update_tle_catalog,
)


router = APIRouter(
    prefix="/api/tle",
    tags=["tle"],
)


def build_status_response(
    db: Session,
) -> TLEStatusResponse:
    status = get_tle_catalog_status(db)

    return TLEStatusResponse(
        source_name="CelesTrak",
        last_updated_at=status.last_updated_at,
        next_update_at=status.next_update_at,
        is_stale=status.is_stale,
        is_updating=is_tle_update_in_progress(),
        current_records=status.current_records,
        total_satellites=status.total_satellites,
    )


def build_update_response(
    result,
) -> TLEUpdateResponse:
    return TLEUpdateResponse(
        source_name="CelesTrak",
        last_updated_at=result.status.last_updated_at,
        next_update_at=result.status.next_update_at,
        is_stale=result.status.is_stale,
        is_updating=is_tle_update_in_progress(),
        current_records=result.status.current_records,
        total_satellites=result.status.total_satellites,
        updated_records=result.updated_records,
        details=result.details,
    )


@router.get(
    "/status",
    response_model=TLEStatusResponse,
)
def get_tle_status(
    db: Session = Depends(get_db),
):
    return build_status_response(db)


@router.post(
    "/ensure-current",
    response_model=TLEUpdateResponse,
)
async def ensure_current_tle(
    payload: TLEUpdateRequest,
    db: Session = Depends(get_db),
):
    result = await update_tle_catalog(
        db,
        satellite_ids=payload.satellite_ids,
        force=False,
    )

    return build_update_response(result)


@router.post(
    "/update",
    response_model=TLEUpdateResponse,
)
async def update_tle(
    payload: TLEUpdateRequest,
    db: Session = Depends(get_db),
):
    result = await update_tle_catalog(
        db,
        satellite_ids=payload.satellite_ids,
        force=True,
    )

    return build_update_response(result)