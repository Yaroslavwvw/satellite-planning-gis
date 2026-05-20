from typing import Any

from pyproj import Transformer
from shapely.geometry import LineString, mapping, shape
from shapely.ops import transform


def _get_utm_epsg(longitude: float, latitude: float) -> int:
    zone = int((longitude + 180) / 6) + 1
    return 32600 + zone if latitude >= 0 else 32700 + zone


def _get_local_transformers(aoi_geojson: dict[str, Any]):
    aoi_geometry = shape(aoi_geojson)
    centroid = aoi_geometry.centroid

    epsg = _get_utm_epsg(centroid.x, centroid.y)

    to_local = Transformer.from_crs(
        "EPSG:4326",
        f"EPSG:{epsg}",
        always_xy=True,
    )

    to_wgs84 = Transformer.from_crs(
        f"EPSG:{epsg}",
        "EPSG:4326",
        always_xy=True,
    )

    return to_local, to_wgs84


def build_track_line_geojson(track_points: list[dict[str, Any]]) -> dict[str, Any] | None:
    coordinates = [
        [point["longitude"], point["latitude"]]
        for point in track_points
        if point.get("longitude") is not None and point.get("latitude") is not None
    ]

    if len(coordinates) < 2:
        return None

    return {
        "type": "LineString",
        "coordinates": coordinates,
    }


def build_footprint_corridor_geojson(
    track_points: list[dict[str, Any]],
    aoi_geojson: dict[str, Any],
    swath_km: float | None,
) -> dict[str, Any] | None:
    if swath_km is None:
        return None

    swath_km_float = float(swath_km)

    if swath_km_float <= 0:
        return None

    coordinates = [
        (point["longitude"], point["latitude"])
        for point in track_points
        if point.get("longitude") is not None and point.get("latitude") is not None
    ]

    if len(coordinates) < 2:
        return None

    to_local, to_wgs84 = _get_local_transformers(aoi_geojson)

    line_wgs84 = LineString(coordinates)
    line_local = transform(to_local.transform, line_wgs84)

    half_swath_m = (swath_km_float * 1000.0) / 2.0

    corridor_local = line_local.buffer(
        half_swath_m,
        cap_style=2,
        join_style=2,
    )

    # Упрощаем геометрию для карты, чтобы не отправлять слишком тяжёлый GeoJSON.
    corridor_local = corridor_local.simplify(10_000, preserve_topology=True)

    corridor_wgs84 = transform(to_wgs84.transform, corridor_local)

    return mapping(corridor_wgs84)