from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.calculation_run import CalculationRun
from app.models.calculation_run_satellite import CalculationRunSatellite
from app.schemas.calculation import CalculationCreate, CalculationPlaceholderResponse, CalculationRead

router = APIRouter(prefix="/api/calculations", tags=["calculations"])


@router.post("", response_model=CalculationPlaceholderResponse)
def create_calculation(payload: CalculationCreate, db: Session = Depends(get_db)):
    run = CalculationRun(
        aoi_id=payload.aoi_id,
        period_start=payload.period_start,
        period_end=payload.period_end,
        status="queued",
        result_payload={
            "note": "Prototype placeholder. Full SGP4 pass/visibility calculation is not implemented yet.",
            "satellites_requested": payload.satellite_ids,
        },
    )
    db.add(run)
    db.flush()

    for satellite_id in payload.satellite_ids:
        db.add(CalculationRunSatellite(calculation_run_id=run.id, satellite_id=satellite_id))

    db.commit()
    db.refresh(run)

    placeholder = {
        "status": "placeholder",
        "summary": "Calculation run created. Detailed orbital/visibility outputs will be added later.",
        "windows": [],
    }
    return CalculationPlaceholderResponse(calculation_run=CalculationRead.model_validate(run), placeholder=placeholder)


@router.get("/{calculation_run_id}", response_model=CalculationRead)
def get_calculation(calculation_run_id: int, db: Session = Depends(get_db)):
    run = db.get(CalculationRun, calculation_run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Calculation run not found")
    return run
