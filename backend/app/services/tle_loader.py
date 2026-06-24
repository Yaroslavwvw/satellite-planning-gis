from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.satellite import Satellite
from app.models.tle_record import TLERecord


CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php"

# TLE считаются актуальными в течение 24 часов.
TLE_REFRESH_INTERVAL = timedelta(hours=24)

# Фоновая задача проверяет состояние каждый час.
# Само обновление выполняется только после истечения 24 часов.
TLE_CHECK_INTERVAL_SECONDS = 60 * 60

# Защищает от одновременного запуска обновления
# из фоновой задачи и через HTTP-запрос.
_tle_update_lock = asyncio.Lock()


@dataclass
class ParsedTLE:
    line1: str
    line2: str
    epoch_utc: datetime


@dataclass
class TLECatalogStatus:
    last_updated_at: datetime | None
    next_update_at: datetime | None
    is_stale: bool
    current_records: int
    total_satellites: int


@dataclass
class TLEUpdateResult:
    updated_records: int
    details: list[str]
    status: TLECatalogStatus


def utc_now_naive() -> datetime:
    """
    База хранит DateTime без timezone, но значение считается UTC.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


def to_utc_aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None

    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)


def is_tle_update_in_progress() -> bool:
    return _tle_update_lock.locked()


def read_satellites_for_update(
    db: Session,
    satellite_ids: list[int] | None = None,
) -> list[Satellite]:
    query = select(Satellite).order_by(Satellite.satellite_id)

    if satellite_ids:
        query = query.where(
            Satellite.satellite_id.in_(satellite_ids)
        )

    return list(db.scalars(query))


def get_tle_catalog_status(db: Session) -> TLECatalogStatus:
    total_satellites = (
        db.scalar(
            select(func.count(Satellite.satellite_id))
        )
        or 0
    )

    current_records = (
        db.scalar(
            select(
                func.count(
                    func.distinct(TLERecord.satellite_id)
                )
            ).where(TLERecord.is_current.is_(True))
        )
        or 0
    )

    last_updated_db = db.scalar(
        select(func.max(TLERecord.fetched_at))
    )

    last_updated_at = to_utc_aware(last_updated_db)
    now = datetime.now(timezone.utc)

    has_missing_records = current_records < total_satellites

    is_expired = (
        last_updated_at is None
        or now - last_updated_at >= TLE_REFRESH_INTERVAL
    )

    is_stale = (
        total_satellites > 0
        and (has_missing_records or is_expired)
    )

    next_update_at = (
        last_updated_at + TLE_REFRESH_INTERVAL
        if last_updated_at is not None
        else None
    )

    return TLECatalogStatus(
        last_updated_at=last_updated_at,
        next_update_at=next_update_at,
        is_stale=is_stale,
        current_records=current_records,
        total_satellites=total_satellites,
    )


async def request_tle_by_norad(
    norad_id: int,
    client: httpx.AsyncClient | None = None,
) -> str:
    params = {
        "CATNR": norad_id,
        "FORMAT": "TLE",
    }

    if client is not None:
        response = await client.get(
            CELESTRAK_URL,
            params=params,
        )
        response.raise_for_status()
        return response.text

    async with httpx.AsyncClient(timeout=15) as local_client:
        response = await local_client.get(
            CELESTRAK_URL,
            params=params,
        )
        response.raise_for_status()
        return response.text


def parse_tle_epoch(line1: str) -> datetime:
    epoch_str = line1[18:32].strip()

    year_short = int(epoch_str[:2])
    day_of_year = float(epoch_str[2:])

    if year_short < 57:
        year = 2000 + year_short
    else:
        year = 1900 + year_short

    start_of_year = datetime(year, 1, 1)

    return start_of_year + timedelta(
        days=day_of_year - 1,
    )


def parse_tle_lines(raw_text: str) -> ParsedTLE | None:
    lines = [
        line.strip()
        for line in raw_text.splitlines()
        if line.strip()
    ]

    if len(lines) < 2:
        return None

    if (
        lines[0].startswith("1 ")
        and lines[1].startswith("2 ")
    ):
        line1 = lines[0]
        line2 = lines[1]

    elif (
        len(lines) >= 3
        and lines[1].startswith("1 ")
        and lines[2].startswith("2 ")
    ):
        line1 = lines[1]
        line2 = lines[2]

    else:
        return None

    return ParsedTLE(
        line1=line1,
        line2=line2,
        epoch_utc=parse_tle_epoch(line1),
    )


def save_tle_record(
    db: Session,
    satellite_id: int,
    parsed_tle: ParsedTLE,
) -> TLERecord:
    db.execute(
        update(TLERecord)
        .where(TLERecord.satellite_id == satellite_id)
        .where(TLERecord.is_current.is_(True))
        .values(is_current=False)
    )

    record = TLERecord(
        satellite_id=satellite_id,
        line1=parsed_tle.line1,
        line2=parsed_tle.line2,
        epoch_utc=parsed_tle.epoch_utc,
        source_name="CelesTrak",
        fetched_at=utc_now_naive(),
        is_current=True,
    )

    db.add(record)

    return record


async def update_tle_catalog(
    db: Session,
    satellite_ids: list[int] | None = None,
    *,
    force: bool = False,
) -> TLEUpdateResult:
    """
    Обновляет каталог TLE.

    force=False:
        обновляет только при отсутствии или устаревании данных.

    force=True:
        выполняет принудительное ручное обновление.
    """
    async with _tle_update_lock:
        status_before = get_tle_catalog_status(db)

        if not force and not status_before.is_stale:
            return TLEUpdateResult(
                updated_records=0,
                details=["TLE already current"],
                status=status_before,
            )

        satellites = read_satellites_for_update(
            db,
            satellite_ids,
        )

        updated_records = 0
        details: list[str] = []

        async with httpx.AsyncClient(timeout=15) as client:
            for satellite in satellites:
                try:
                    raw_tle = await request_tle_by_norad(
                        satellite.norad_id,
                        client,
                    )

                    parsed_tle = parse_tle_lines(raw_tle)

                    if parsed_tle is None:
                        details.append(
                            f"{satellite.name}: invalid TLE format"
                        )
                        continue

                    save_tle_record(
                        db,
                        satellite.satellite_id,
                        parsed_tle,
                    )

                    updated_records += 1
                    details.append(
                        f"{satellite.name}: updated"
                    )

                except Exception as exc:
                    # Старый текущий TLE для этого спутника не изменяется,
                    # поскольку save_tle_record ещё не был вызван.
                    details.append(
                        f"{satellite.name}: failed "
                        f"({exc.__class__.__name__})"
                    )

        try:
            db.commit()
        except Exception:
            db.rollback()
            raise

        status_after = get_tle_catalog_status(db)

        return TLEUpdateResult(
            updated_records=updated_records,
            details=details,
            status=status_after,
        )


async def ensure_tle_current(
    db: Session,
) -> TLEUpdateResult:
    return await update_tle_catalog(
        db,
        satellite_ids=None,
        force=False,
    )