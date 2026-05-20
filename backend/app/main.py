from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.aois import router as aois_router
from app.api.routes.calculations import router as calculations_router
from app.api.routes.satellites import router as satellites_router
from app.api.routes.tle import router as tle_router
from app.api.routes.orbits import router as orbits_router
from app.core.config import get_settings



settings = get_settings()
app = FastAPI(title=settings.app_name, debug=settings.debug)

app.include_router(orbits_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(satellites_router)
app.include_router(tle_router)
app.include_router(aois_router)
app.include_router(calculations_router)
