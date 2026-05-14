from __future__ import annotations

from dataclasses import dataclass

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.satellite import Satellite
from app.models.tle_record import TLERecord


CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php"


@dataclass
class ParsedTLE:
    line1: str
    line2: str


def read_satellites_for_update(db: Session, satellite_ids: list[int] | None = None) -> list[Satellite]:
    query = select(Satellite).order_by(Satellite.id)
    if satellite_ids:
        query = query.where(Satellite.id.in_(satellite_ids))
    return list(db.scalars(query))


async def request_tle_by_norad(norad_id: int) -> str:
    params = {"CATNR": norad_id, "FORMAT": "TLE"}
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(CELESTRAK_URL, params=params)
        response.raise_for_status()
        return response.text


def parse_tle_lines(raw_text: str) -> ParsedTLE | None:
    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
    if len(lines) < 2:
        return None

    # Some providers return 3 lines (name + line1 + line2), some return 2 lines directly.
    if lines[0].startswith("1 ") and lines[1].startswith("2 "):
        return ParsedTLE(line1=lines[0], line2=lines[1])
    if len(lines) >= 3 and lines[1].startswith("1 ") and lines[2].startswith("2 "):
        return ParsedTLE(line1=lines[1], line2=lines[2])
    return None


def save_tle_record(db: Session, satellite_id: int, parsed_tle: ParsedTLE) -> TLERecord:
    record = TLERecord(
        satellite_id=satellite_id,
        line1=parsed_tle.line1,
        line2=parsed_tle.line2,
        source="celestrak",
    )
    db.add(record)
    return record
