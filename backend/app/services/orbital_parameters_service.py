from __future__ import annotations

import math
from dataclasses import dataclass


EARTH_MU_KM3_S2 = 398600.4418
EARTH_RADIUS_KM = 6378.137
MINUTES_PER_DAY = 1440.0
SECONDS_PER_DAY = 86400.0


@dataclass(frozen=True)
class OrbitalParameters:
    inclination_deg: float
    orbital_period_min: float
    mean_altitude_km: float


def calculate_orbital_parameters_from_tle(line2: str) -> OrbitalParameters:
    """
    Рассчитывает основные орбитальные параметры из второй строки TLE.

    line2 содержит:
    - наклонение орбиты;
    - среднее движение, оборотов в сутки.

    По среднему движению считаем:
    - период обращения;
    - среднюю высоту орбиты.
    """

    parts = line2.split()

    if len(parts) < 8:
        raise ValueError("Invalid TLE line2 format")

    inclination_deg = float(parts[2])
    mean_motion_rev_per_day = float(parts[7])

    if mean_motion_rev_per_day <= 0:
        raise ValueError("TLE mean motion must be greater than 0")

    orbital_period_min = MINUTES_PER_DAY / mean_motion_rev_per_day

    mean_motion_rad_per_sec = (
        mean_motion_rev_per_day * 2.0 * math.pi / SECONDS_PER_DAY
    )

    semi_major_axis_km = (
        EARTH_MU_KM3_S2 / (mean_motion_rad_per_sec**2)
    ) ** (1.0 / 3.0)

    mean_altitude_km = semi_major_axis_km - EARTH_RADIUS_KM

    return OrbitalParameters(
        inclination_deg=round(inclination_deg, 3),
        orbital_period_min=round(orbital_period_min, 3),
        mean_altitude_km=round(mean_altitude_km, 3),
    )