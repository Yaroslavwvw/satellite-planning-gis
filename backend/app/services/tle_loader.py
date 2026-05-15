# from __future__ import annotations

# from dataclasses import dataclass

# import httpx
# from sqlalchemy import select
# from sqlalchemy.orm import Session

# from app.models.satellite import Satellite
# from app.models.tle_record import TLERecord


# CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php"


# @dataclass
# class ParsedTLE:
#     line1: str
#     line2: str


# def read_satellites_for_update(db: Session, satellite_ids: list[int] | None = None) -> list[Satellite]:
#     query = select(Satellite).order_by(Satellite.id)
#     if satellite_ids:
#         query = query.where(Satellite.id.in_(satellite_ids))
#     return list(db.scalars(query))


# async def request_tle_by_norad(norad_id: int) -> str:
#     params = {"CATNR": norad_id, "FORMAT": "TLE"}
#     async with httpx.AsyncClient(timeout=10) as client:
#         response = await client.get(CELESTRAK_URL, params=params)
#         response.raise_for_status()
#         return response.text


# def parse_tle_lines(raw_text: str) -> ParsedTLE | None:
#     lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
#     if len(lines) < 2:
#         return None

#     # Some providers return 3 lines (name + line1 + line2), some return 2 lines directly.
#     if lines[0].startswith("1 ") and lines[1].startswith("2 "):
#         return ParsedTLE(line1=lines[0], line2=lines[1])
#     if len(lines) >= 3 and lines[1].startswith("1 ") and lines[2].startswith("2 "):
#         return ParsedTLE(line1=lines[1], line2=lines[2])
#     return None


# def save_tle_record(db: Session, satellite_id: int, parsed_tle: ParsedTLE) -> TLERecord:
#     record = TLERecord(
#         satellite_id=satellite_id,
#         line1=parsed_tle.line1,
#         line2=parsed_tle.line2,
#         source="celestrak",
#     )
#     db.add(record)
#     return record


from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

import httpx
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.satellite import Satellite
from app.models.tle_record import TLERecord


CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php"


@dataclass
class ParsedTLE:
    line1: str
    line2: str
    epoch_utc: datetime


def read_satellites_for_update(
    db: Session,
    satellite_ids: list[int] | None = None,
) -> list[Satellite]:
    query = select(Satellite).order_by(Satellite.satellite_id)

    if satellite_ids:
        query = query.where(Satellite.satellite_id.in_(satellite_ids))

    return list(db.scalars(query))


async def request_tle_by_norad(norad_id: int) -> str:
    params = {
        "CATNR": norad_id,
        "FORMAT": "TLE",
    }

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(CELESTRAK_URL, params=params)
        response.raise_for_status()
        return response.text


def parse_tle_epoch(line1: str) -> datetime:
    """
    TLE epoch находится в первой строке:
    позиции 18-32: YYDDD.DDDDDDDD

    Пример:
    26081.24045083
    26  -> 2026 год
    081 -> 81-й день года
    .24045083 -> доля суток
    """
    epoch_str = line1[18:32].strip()

    year_short = int(epoch_str[:2])
    day_of_year = float(epoch_str[2:])

    if year_short < 57:
        year = 2000 + year_short
    else:
        year = 1900 + year_short

    start_of_year = datetime(year, 1, 1)
    epoch = start_of_year + timedelta(days=day_of_year - 1)

    return epoch


def parse_tle_lines(raw_text: str) -> ParsedTLE | None:
    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]

    if len(lines) < 2:
        return None

    # Вариант: сразу две строки TLE
    if lines[0].startswith("1 ") and lines[1].startswith("2 "):
        line1 = lines[0]
        line2 = lines[1]
        return ParsedTLE(
            line1=line1,
            line2=line2,
            epoch_utc=parse_tle_epoch(line1),
        )

    # Вариант: название + две строки TLE
    if len(lines) >= 3 and lines[1].startswith("1 ") and lines[2].startswith("2 "):
        line1 = lines[1]
        line2 = lines[2]
        return ParsedTLE(
            line1=line1,
            line2=line2,
            epoch_utc=parse_tle_epoch(line1),
        )

    return None


def save_tle_record(
    db: Session,
    satellite_id: int,
    parsed_tle: ParsedTLE,
) -> TLERecord:
    # Сначала снимаем актуальность со старых TLE этого спутника
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
        fetched_at=datetime.utcnow(),
        is_current=True,
    )

    db.add(record)
    return record