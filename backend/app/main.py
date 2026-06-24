import os
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.aois import router as aois_router
from app.api.routes.calculations import router as calculations_router
from app.api.routes.orbits import router as orbits_router
from app.api.routes.satellites import router as satellites_router
from app.api.routes.tle import router as tle_router
from app.core.config import get_settings
from app.core.database import get_db
from app.services.tle_loader import (
    TLE_CHECK_INTERVAL_SECONDS,
    ensure_tle_current,
)


logger = logging.getLogger(__name__)


async def check_and_update_tle() -> None:
    """
    Открывает отдельную сессию БД для фоновой задачи.
    """
    db_generator = get_db()

    try:
        db = next(db_generator)
        result = await ensure_tle_current(db)

        if result.updated_records > 0:
            logger.info(
                "Automatic TLE update completed: %s records",
                result.updated_records,
            )

    except Exception:
        logger.exception("Automatic TLE update failed")

    finally:
        db_generator.close()


async def tle_refresh_loop() -> None:
    """
    Сразу проверяет TLE после запуска backend,
    затем повторяет проверку каждый час.
    """
    while True:
        await check_and_update_tle()

        try:
            await asyncio.sleep(
                TLE_CHECK_INTERVAL_SECONDS
            )
        except asyncio.CancelledError:
            break


@asynccontextmanager
async def lifespan(app: FastAPI):
    tle_task = asyncio.create_task(
        tle_refresh_loop()
    )

    yield

    tle_task.cancel()

    try:
        await tle_task
    except asyncio.CancelledError:
        pass


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
    lifespan=lifespan,
)

frontend_origins = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(orbits_router)
app.include_router(satellites_router)
app.include_router(tle_router)
app.include_router(aois_router)
app.include_router(calculations_router)