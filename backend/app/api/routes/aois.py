from fastapi import APIRouter, Depends, HTTPException
from geoalchemy2.shape import from_shape
from shapely.geometry import shape
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.aoi import AOI
from app.schemas.aoi import AOICreate, AOIRead

router = APIRouter(prefix="/api/aois", tags=["aois"])


@router.post("", response_model=AOIRead)
def create_aoi(payload: AOICreate, db: Session = Depends(get_db)):
    try:
        geometry_obj = shape(payload.geometry)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid geometry: {exc}") from exc

    if geometry_obj.geom_type != "Polygon":
        raise HTTPException(status_code=400, detail="Only Polygon AOI is supported in this prototype")

    aoi = AOI(name=payload.name, geom=from_shape(geometry_obj, srid=4326))
    db.add(aoi)
    db.commit()
    db.refresh(aoi)
    return aoi
