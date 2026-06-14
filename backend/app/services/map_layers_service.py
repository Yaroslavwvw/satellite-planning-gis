import math
from typing import Any

from pyproj import Transformer
from shapely.geometry import LineString, Point, Polygon, mapping, shape
from shapely.ops import transform, unary_union

WEB_MERCATOR_RADIUS_M = 6378137.0
MAX_MERCATOR_LAT = 85.05112878


def _get_aoi_centroid(aoi_geojson: dict[str, Any]) -> tuple[float, float]:
    aoi_geometry = shape(aoi_geojson)
    centroid = aoi_geometry.centroid
    return centroid.x, centroid.y


def _normalize_longitude_near_center(longitude: float, center_longitude: float) -> float:
    normalized = longitude

    while normalized - center_longitude > 180:
        normalized -= 360

    while normalized - center_longitude < -180:
        normalized += 360

    return normalized


def _get_local_aeqd_transformers(aoi_geojson: dict[str, Any]):
    center_lon, center_lat = _get_aoi_centroid(aoi_geojson)

    local_crs = (
        f"+proj=aeqd +lat_0={center_lat} +lon_0={center_lon} "
        "+datum=WGS84 +units=m +no_defs"
    )

    to_local = Transformer.from_crs(
        "EPSG:4326",
        local_crs,
        always_xy=True,
    )

    return to_local


def _project_aoi(aoi_geojson: dict[str, Any], to_local: Transformer):
    aoi_geometry = shape(aoi_geojson)
    return transform(to_local.transform, aoi_geometry)


def _lonlat_to_web_mercator(longitude: float, latitude: float) -> tuple[float, float]:
    safe_latitude = max(min(latitude, MAX_MERCATOR_LAT), -MAX_MERCATOR_LAT)

    x = WEB_MERCATOR_RADIUS_M * math.radians(longitude)
    y = WEB_MERCATOR_RADIUS_M * math.log(
        math.tan(math.pi / 4.0 + math.radians(safe_latitude) / 2.0)
    )

    return x, y


def _web_mercator_to_lonlat(x: float, y: float) -> list[float]:
    longitude = math.degrees(x / WEB_MERCATOR_RADIUS_M)
    latitude = math.degrees(
        2.0 * math.atan(math.exp(y / WEB_MERCATOR_RADIUS_M)) - math.pi / 2.0
    )

    return [longitude, latitude]


def _convert_web_mercator_geojson_to_lonlat(geometry: dict[str, Any]) -> dict[str, Any]:
    def convert_coordinates(coords):
        if not coords:
            return coords

        if isinstance(coords[0], (int, float)):
            return _web_mercator_to_lonlat(coords[0], coords[1])

        return [convert_coordinates(item) for item in coords]

    return {
        **geometry,
        "coordinates": convert_coordinates(geometry["coordinates"]),
    }


def _polygon_like_to_geojson(geometry) -> dict[str, Any] | None:
    if geometry.is_empty:
        return None

    if geometry.geom_type in {"Polygon", "MultiPolygon"}:
        return mapping(geometry)

    if geometry.geom_type == "GeometryCollection":
        polygons = [
            item
            for item in geometry.geoms
            if item.geom_type in {"Polygon", "MultiPolygon"} and not item.is_empty
        ]

        if not polygons:
            return None

        if len(polygons) == 1:
            return mapping(polygons[0])

        multipolygon_coordinates = []

        for polygon in polygons:
            polygon_geojson = mapping(polygon)

            if polygon_geojson["type"] == "Polygon":
                multipolygon_coordinates.append(polygon_geojson["coordinates"])

            if polygon_geojson["type"] == "MultiPolygon":
                multipolygon_coordinates.extend(polygon_geojson["coordinates"])

        return {
            "type": "MultiPolygon",
            "coordinates": multipolygon_coordinates,
        }

    return None


def select_track_segment_near_aoi(
    track_points: list[dict[str, Any]],
    aoi_geojson: dict[str, Any],
    points_before: int = 3,
    points_after: int = 3,
) -> list[dict[str, Any]]:
    """
    Берём короткий участок трассы вокруг точки максимального сближения с AOI.
    Это именно визуальный участок для карты, не вся орбита и не весь расчётный период.
    """
    if len(track_points) < 2:
        return []

    center_lon, _ = _get_aoi_centroid(aoi_geojson)
    to_local = _get_local_aeqd_transformers(aoi_geojson)
    projected_aoi = _project_aoi(aoi_geojson, to_local)

    best_index: int | None = None
    best_distance: float | None = None

    for index, point in enumerate(track_points):
        longitude = point.get("longitude")
        latitude = point.get("latitude")

        if longitude is None or latitude is None:
            continue

        normalized_longitude = _normalize_longitude_near_center(
            longitude,
            center_lon,
        )

        x, y = to_local.transform(normalized_longitude, latitude)
        distance = projected_aoi.distance(Point(x, y))

        if best_distance is None or distance < best_distance:
            best_distance = distance
            best_index = index

    if best_index is None:
        return []

    start_index = max(0, best_index - points_before)
    end_index = min(len(track_points), best_index + points_after + 1)

    segment = track_points[start_index:end_index]

    if len(segment) < 2:
        return []

    return segment


def build_track_line_geojson(
    track_points: list[dict[str, Any]],
    aoi_geojson: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    if len(track_points) < 2:
        return None

    center_lon = None

    if aoi_geojson is not None:
        center_lon, _ = _get_aoi_centroid(aoi_geojson)

    coordinates: list[list[float]] = []

    for point in track_points:
        longitude = point.get("longitude")
        latitude = point.get("latitude")

        if longitude is None or latitude is None:
            continue

        if center_lon is not None:
            longitude = _normalize_longitude_near_center(longitude, center_lon)

        coordinates.append([longitude, latitude])

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
    """
    Строит визуальный corridor для Leaflet.

    Важно:
    - corridor строится в Web Mercator, то есть в проекции карты Leaflet;
    - поэтому он визуально идёт вокруг трассы и не должен смещаться;
    - для физического процента покрытия AOI позже сделаем отдельный расчёт.
    """
    if swath_km is None:
        return None

    swath_km_float = float(swath_km)

    if swath_km_float <= 0:
        return None

    if len(track_points) < 2:
        return None

    center_lon, center_lat = _get_aoi_centroid(aoi_geojson)

    web_mercator_coordinates: list[tuple[float, float]] = []

    for point in track_points:
        longitude = point.get("longitude")
        latitude = point.get("latitude")

        if longitude is None or latitude is None:
            continue

        normalized_longitude = _normalize_longitude_near_center(
            longitude,
            center_lon,
        )

        web_mercator_coordinates.append(
            _lonlat_to_web_mercator(normalized_longitude, latitude)
        )

    if len(web_mercator_coordinates) < 2:
        return None

    line_web_mercator = LineString(web_mercator_coordinates)

    half_swath_m = (swath_km_float * 1000.0) / 2.0

    # Web Mercator растягивает расстояния по широте.
    # Чтобы визуальная ширина на карте была ближе к реальной ширине на земле,
    # масштабируем метрический буфер через cos(latitude AOI).
    latitude_scale = max(math.cos(math.radians(center_lat)), 0.15)
    visual_half_swath_m = half_swath_m / latitude_scale

    corridor_web_mercator = line_web_mercator.buffer(
        visual_half_swath_m,
        cap_style=2,
        join_style=2,
    )

    if corridor_web_mercator.is_empty:
        return None

    corridor_web_mercator = corridor_web_mercator.simplify(
        500,
        preserve_topology=True,
    )

    corridor_geojson_web_mercator = _polygon_like_to_geojson(corridor_web_mercator)

    if corridor_geojson_web_mercator is None:
        return None

    return _convert_web_mercator_geojson_to_lonlat(corridor_geojson_web_mercator)


def _get_average_altitude_km(track_points: list[dict[str, Any]]) -> float | None:
    altitude_values: list[float] = []

    for point in track_points:
        altitude_km = point.get("altitude_km")

        if altitude_km is None:
            continue

        altitude_values.append(float(altitude_km))

    if not altitude_values:
        return None

    return sum(altitude_values) / len(altitude_values)


def build_reachable_footprint_corridor_geojson(
    track_points: list[dict[str, Any]],
    aoi_geojson: dict[str, Any],
    swath_km: float | None,
    max_off_nadir_deg: float | None,
) -> dict[str, Any] | None:
    """
    Строит зону возможного бокового наведения для обычных оптических/тепловых сенсоров.

    Это не SAR-зона. Для SAR используется отдельная функция:
    build_sar_footprint_corridor_geojson.
    """
    if swath_km is None:
        return None

    if max_off_nadir_deg is None:
        return None

    swath_km_float = float(swath_km)
    max_off_nadir_deg_float = float(max_off_nadir_deg)

    if swath_km_float <= 0:
        return None

    if max_off_nadir_deg_float <= 0:
        return None

    average_altitude_km = _get_average_altitude_km(track_points)

    if average_altitude_km is None:
        return None

    side_shift_km = average_altitude_km * math.tan(
        math.radians(max_off_nadir_deg_float)
    )

    reachable_swath_km = swath_km_float + 2.0 * side_shift_km

    return build_footprint_corridor_geojson(
        track_points=track_points,
        aoi_geojson=aoi_geojson,
        swath_km=reachable_swath_km,
    )


def _calculate_ground_range_km(
    *,
    altitude_km: float,
    look_angle_deg: float,
) -> float | None:
    if altitude_km <= 0:
        return None

    if look_angle_deg <= 0 or look_angle_deg >= 90:
        return None

    return altitude_km * math.tan(math.radians(look_angle_deg))


def _normalize_sar_look_direction(value: str | None) -> str:
    if value in {"left", "right", "both"}:
        return value

    return "both"


def _extract_offset_line(geometry) -> LineString | None:
    if geometry.is_empty:
        return None

    if geometry.geom_type == "LineString":
        return geometry

    if geometry.geom_type == "MultiLineString":
        lines = [line for line in geometry.geoms if not line.is_empty]

        if not lines:
            return None

        return max(lines, key=lambda line: line.length)

    return None


def _build_sar_side_band_web_mercator(
    *,
    line_web_mercator: LineString,
    near_range_m: float,
    far_range_m: float,
    side: str,
):
    if far_range_m <= near_range_m:
        return None

    near_offset = _extract_offset_line(
        line_web_mercator.parallel_offset(
            near_range_m,
            side,
            join_style=2,
        )
    )
    far_offset = _extract_offset_line(
        line_web_mercator.parallel_offset(
            far_range_m,
            side,
            join_style=2,
        )
    )

    if near_offset is None or far_offset is None:
        return None

    near_coordinates = list(near_offset.coords)
    far_coordinates = list(far_offset.coords)

    if len(near_coordinates) < 2 or len(far_coordinates) < 2:
        return None

    polygon_coordinates = far_coordinates + list(reversed(near_coordinates))

    if polygon_coordinates[0] != polygon_coordinates[-1]:
        polygon_coordinates.append(polygon_coordinates[0])

    polygon = Polygon(polygon_coordinates)

    if polygon.is_empty:
        return None

    fixed_polygon = polygon.buffer(0)

    if fixed_polygon.is_empty:
        return None

    return fixed_polygon


def build_sar_footprint_corridor_geojson(
    track_points: list[dict[str, Any]],
    aoi_geojson: dict[str, Any],
    sar_min_look_angle_deg: float | None,
    sar_max_look_angle_deg: float | None,
    sar_look_direction: str | None = "both",
) -> dict[str, Any] | None:
    """
    Строит визуальную боковую SAR-зону обзора.

    В отличие от оптических сенсоров, SAR-зона не является буфером вокруг
    подспутниковой трассы. Она располагается сбоку от трассы между ближним
    и дальним углом визирования.
    """
    if len(track_points) < 2:
        return None

    if sar_min_look_angle_deg is None or sar_max_look_angle_deg is None:
        return None

    sar_min_look_angle = float(sar_min_look_angle_deg)
    sar_max_look_angle = float(sar_max_look_angle_deg)

    if sar_min_look_angle <= 0:
        return None

    if sar_max_look_angle <= sar_min_look_angle:
        return None

    if sar_max_look_angle >= 90:
        return None

    average_altitude_km = _get_average_altitude_km(track_points)

    if average_altitude_km is None:
        return None

    near_range_km = _calculate_ground_range_km(
        altitude_km=average_altitude_km,
        look_angle_deg=sar_min_look_angle,
    )
    far_range_km = _calculate_ground_range_km(
        altitude_km=average_altitude_km,
        look_angle_deg=sar_max_look_angle,
    )

    if near_range_km is None or far_range_km is None:
        return None

    if far_range_km <= near_range_km:
        return None

    center_lon, center_lat = _get_aoi_centroid(aoi_geojson)

    web_mercator_coordinates: list[tuple[float, float]] = []

    for point in track_points:
        longitude = point.get("longitude")
        latitude = point.get("latitude")

        if longitude is None or latitude is None:
            continue

        normalized_longitude = _normalize_longitude_near_center(
            longitude,
            center_lon,
        )

        web_mercator_coordinates.append(
            _lonlat_to_web_mercator(normalized_longitude, latitude)
        )

    if len(web_mercator_coordinates) < 2:
        return None

    line_web_mercator = LineString(web_mercator_coordinates)

    latitude_scale = max(math.cos(math.radians(center_lat)), 0.15)
    visual_near_range_m = near_range_km * 1000.0 / latitude_scale
    visual_far_range_m = far_range_km * 1000.0 / latitude_scale

    look_direction = _normalize_sar_look_direction(sar_look_direction)

    side_geometries = []

    if look_direction in {"left", "both"}:
        left_band = _build_sar_side_band_web_mercator(
            line_web_mercator=line_web_mercator,
            near_range_m=visual_near_range_m,
            far_range_m=visual_far_range_m,
            side="left",
        )

        if left_band is not None:
            side_geometries.append(left_band)

    if look_direction in {"right", "both"}:
        right_band = _build_sar_side_band_web_mercator(
            line_web_mercator=line_web_mercator,
            near_range_m=visual_near_range_m,
            far_range_m=visual_far_range_m,
            side="right",
        )

        if right_band is not None:
            side_geometries.append(right_band)

    if not side_geometries:
        return None

    sar_zone_web_mercator = unary_union(side_geometries)

    if sar_zone_web_mercator.is_empty:
        return None

    sar_zone_web_mercator = sar_zone_web_mercator.simplify(
        500,
        preserve_topology=True,
    )

    sar_zone_geojson_web_mercator = _polygon_like_to_geojson(sar_zone_web_mercator)

    if sar_zone_geojson_web_mercator is None:
        return None

    return _convert_web_mercator_geojson_to_lonlat(sar_zone_geojson_web_mercator)

def _normalize_geojson_longitudes(
    geometry: dict[str, Any],
    center_longitude: float,
) -> dict[str, Any]:
    def normalize_coords(coords):
        if not coords:
            return coords

        if isinstance(coords[0], (int, float)):
            longitude = _normalize_longitude_near_center(coords[0], center_longitude)
            return [longitude, coords[1]]

        return [normalize_coords(item) for item in coords]

    return {
        **geometry,
        "coordinates": normalize_coords(geometry["coordinates"]),
    }


def _make_geometry_valid(geometry):
    if geometry.is_valid:
        return geometry

    fixed = geometry.buffer(0)

    if fixed.is_empty:
        return geometry

    return fixed


def calculate_footprint_coverage_percent(
    aoi_geojson: dict[str, Any],
    footprint_geojson: dict[str, Any] | None,
) -> float | None:
    if footprint_geojson is None:
        return None

    center_lon, _ = _get_aoi_centroid(aoi_geojson)

    normalized_aoi_geojson = _normalize_geojson_longitudes(
        aoi_geojson,
        center_lon,
    )

    normalized_footprint_geojson = _normalize_geojson_longitudes(
        footprint_geojson,
        center_lon,
    )

    to_local = _get_local_aeqd_transformers(normalized_aoi_geojson)

    aoi_local = transform(to_local.transform, shape(normalized_aoi_geojson))
    footprint_local = transform(
        to_local.transform,
        shape(normalized_footprint_geojson),
    )

    aoi_local = _make_geometry_valid(aoi_local)
    footprint_local = _make_geometry_valid(footprint_local)

    if aoi_local.is_empty or footprint_local.is_empty:
        return 0.0

    if aoi_local.area <= 0:
        return None

    intersection = footprint_local.intersection(aoi_local)
    intersection = _make_geometry_valid(intersection)

    if intersection.is_empty:
        return 0.0

    coverage_percent = (intersection.area / aoi_local.area) * 100.0
    coverage_percent = max(0.0, min(100.0, coverage_percent))

    return round(coverage_percent, 1)


def _normalize_geojson_longitudes(
    geometry: dict[str, Any],
    center_longitude: float,
) -> dict[str, Any]:
    def normalize_coords(coords):
        if not coords:
            return coords

        if isinstance(coords[0], (int, float)):
            longitude = _normalize_longitude_near_center(coords[0], center_longitude)
            return [longitude, coords[1]]

        return [normalize_coords(item) for item in coords]

    return {
        **geometry,
        "coordinates": normalize_coords(geometry["coordinates"]),
    }


def _get_coverage_transformer(aoi_geojson: dict[str, Any]) -> Transformer:
    center_lon, center_lat = _get_aoi_centroid(aoi_geojson)

    local_crs = (
        f"+proj=aeqd +lat_0={center_lat} +lon_0={center_lon} "
        "+datum=WGS84 +units=m +no_defs"
    )

    return Transformer.from_crs(
        "EPSG:4326",
        local_crs,
        always_xy=True,
    )


def _make_geometry_valid(geometry):
    if geometry.is_valid:
        return geometry

    fixed = geometry.buffer(0)

    if fixed.is_empty:
        return geometry

    return fixed


def calculate_footprint_coverage_details(
    aoi_geojson: dict[str, Any],
    footprint_geojson: dict[str, Any] | None,
) -> dict[str, float | None]:
    if footprint_geojson is None:
        return {
            "coverage_percent": None,
            "aoi_area_km2": None,
            "footprint_area_km2": None,
            "intersection_area_km2": None,
        }

    center_lon, _ = _get_aoi_centroid(aoi_geojson)

    normalized_aoi_geojson = _normalize_geojson_longitudes(
        aoi_geojson,
        center_lon,
    )

    normalized_footprint_geojson = _normalize_geojson_longitudes(
        footprint_geojson,
        center_lon,
    )

    to_local = _get_coverage_transformer(normalized_aoi_geojson)

    aoi_local = transform(to_local.transform, shape(normalized_aoi_geojson))
    footprint_local = transform(
        to_local.transform,
        shape(normalized_footprint_geojson),
    )

    aoi_local = _make_geometry_valid(aoi_local)
    footprint_local = _make_geometry_valid(footprint_local)

    if aoi_local.is_empty or aoi_local.area <= 0:
        return {
            "coverage_percent": None,
            "aoi_area_km2": None,
            "footprint_area_km2": None,
            "intersection_area_km2": None,
        }

    if footprint_local.is_empty:
        return {
            "coverage_percent": 0.0,
            "aoi_area_km2": round(aoi_local.area / 1_000_000, 3),
            "footprint_area_km2": 0.0,
            "intersection_area_km2": 0.0,
        }

    intersection = footprint_local.intersection(aoi_local)
    intersection = _make_geometry_valid(intersection)

    intersection_area = 0.0 if intersection.is_empty else intersection.area

    coverage_percent = (intersection_area / aoi_local.area) * 100.0
    coverage_percent = max(0.0, min(100.0, coverage_percent))

    return {
        "coverage_percent": round(coverage_percent, 1),
        "aoi_area_km2": round(aoi_local.area / 1_000_000, 3),
        "footprint_area_km2": round(footprint_local.area / 1_000_000, 3),
        "intersection_area_km2": round(intersection_area / 1_000_000, 3),
    }

# from typing import Any

# from pyproj import Geod, Transformer
# from shapely.geometry import Point, shape
# from shapely.ops import transform, unary_union

# GEOD = Geod(ellps="WGS84")


# def _get_aoi_centroid(aoi_geojson: dict[str, Any]) -> tuple[float, float]:
#     aoi_geometry = shape(aoi_geojson)
#     centroid = aoi_geometry.centroid
#     return centroid.x, centroid.y


# def _normalize_longitude_near_center(longitude: float, center_longitude: float) -> float:
#     normalized = longitude

#     while normalized - center_longitude > 180:
#         normalized -= 360

#     while normalized - center_longitude < -180:
#         normalized += 360

#     return normalized


# def _get_local_aeqd_transformer(aoi_geojson: dict[str, Any]) -> Transformer:
#     center_lon, center_lat = _get_aoi_centroid(aoi_geojson)

#     local_crs = (
#         f"+proj=aeqd +lat_0={center_lat} +lon_0={center_lon} "
#         "+datum=WGS84 +units=m +no_defs"
#     )

#     return Transformer.from_crs(
#         "EPSG:4326",
#         local_crs,
#         always_xy=True,
#     )


# def _project_aoi(aoi_geojson: dict[str, Any], to_local: Transformer):
#     return transform(to_local.transform, shape(aoi_geojson))


# def _distance_km_between_points(
#     lon1: float,
#     lat1: float,
#     lon2: float,
#     lat2: float,
# ) -> float:
#     _, _, distance_m = GEOD.inv(lon1, lat1, lon2, lat2)
#     return abs(distance_m) / 1000.0


# def _get_aoi_diagonal_km(aoi_geojson: dict[str, Any]) -> float:
#     aoi_geometry = shape(aoi_geojson)
#     min_lon, min_lat, max_lon, max_lat = aoi_geometry.bounds

#     _, _, distance_m = GEOD.inv(min_lon, min_lat, max_lon, max_lat)

#     return abs(distance_m) / 1000.0


# def _get_track_point_distance_to_aoi_m(
#     point: dict[str, Any],
#     projected_aoi,
#     to_local: Transformer,
#     center_lon: float,
# ) -> float | None:
#     longitude = point.get("longitude")
#     latitude = point.get("latitude")

#     if longitude is None or latitude is None:
#         return None

#     normalized_longitude = _normalize_longitude_near_center(longitude, center_lon)

#     x, y = to_local.transform(normalized_longitude, latitude)

#     return projected_aoi.distance(Point(x, y))


# def select_track_segment_near_aoi(
#     track_points: list[dict[str, Any]],
#     aoi_geojson: dict[str, Any],
#     swath_km: float | None = None,
#     min_segment_km: float = 250.0,
#     max_segment_km: float = 4500.0,
# ) -> list[dict[str, Any]]:
#     """
#     Адаптивно выбирает участок трассы около AOI.

#     Не берём фиксированные 2-3 точки, потому что:
#     - для маленькой AOI это может быть слишком много;
#     - для большой AOI это может быть слишком мало;
#     - для широкого сенсора нужен более длинный пояс визуализации.
#     """
#     if len(track_points) < 2:
#         return []

#     center_lon, _ = _get_aoi_centroid(aoi_geojson)
#     to_local = _get_local_aeqd_transformer(aoi_geojson)
#     projected_aoi = _project_aoi(aoi_geojson, to_local)

#     best_index: int | None = None
#     best_distance_m: float | None = None

#     for index, point in enumerate(track_points):
#         distance_m = _get_track_point_distance_to_aoi_m(
#             point=point,
#             projected_aoi=projected_aoi,
#             to_local=to_local,
#             center_lon=center_lon,
#         )

#         if distance_m is None:
#             continue

#         if best_distance_m is None or distance_m < best_distance_m:
#             best_distance_m = distance_m
#             best_index = index

#     if best_index is None:
#         return []

#     aoi_diagonal_km = _get_aoi_diagonal_km(aoi_geojson)

#     swath_value_km = float(swath_km) if swath_km is not None else 0.0

#     # Длина визуального сегмента:
#     # - зависит от размера AOI;
#     # - зависит от ширины полосы;
#     # - но ограничена сверху, чтобы не рисовать половину орбиты.
#     target_segment_km = max(
#         min_segment_km,
#         aoi_diagonal_km * 1.2,
#         swath_value_km * 0.75,
#     )

#     target_segment_km = min(target_segment_km, max_segment_km)

#     target_each_side_km = target_segment_km / 2.0

#     start_index = best_index
#     end_index = best_index

#     distance_left_km = 0.0

#     while start_index > 0 and distance_left_km < target_each_side_km:
#         current = track_points[start_index]
#         previous = track_points[start_index - 1]

#         current_lon = current.get("longitude")
#         current_lat = current.get("latitude")
#         previous_lon = previous.get("longitude")
#         previous_lat = previous.get("latitude")

#         if None in (current_lon, current_lat, previous_lon, previous_lat):
#             break

#         distance_left_km += _distance_km_between_points(
#             previous_lon,
#             previous_lat,
#             current_lon,
#             current_lat,
#         )

#         start_index -= 1

#     distance_right_km = 0.0

#     while end_index < len(track_points) - 1 and distance_right_km < target_each_side_km:
#         current = track_points[end_index]
#         next_point = track_points[end_index + 1]

#         current_lon = current.get("longitude")
#         current_lat = current.get("latitude")
#         next_lon = next_point.get("longitude")
#         next_lat = next_point.get("latitude")

#         if None in (current_lon, current_lat, next_lon, next_lat):
#             break

#         distance_right_km += _distance_km_between_points(
#             current_lon,
#             current_lat,
#             next_lon,
#             next_lat,
#         )

#         end_index += 1

#     segment = track_points[start_index : end_index + 1]

#     if len(segment) < 2:
#         return []

#     return segment


# def build_track_line_geojson(
#     track_points: list[dict[str, Any]],
#     aoi_geojson: dict[str, Any] | None = None,
# ) -> dict[str, Any] | None:
#     if len(track_points) < 2:
#         return None

#     center_lon = None

#     if aoi_geojson is not None:
#         center_lon, _ = _get_aoi_centroid(aoi_geojson)

#     coordinates: list[list[float]] = []

#     for point in track_points:
#         longitude = point.get("longitude")
#         latitude = point.get("latitude")

#         if longitude is None or latitude is None:
#             continue

#         if center_lon is not None:
#             longitude = _normalize_longitude_near_center(longitude, center_lon)

#         coordinates.append([longitude, latitude])

#     if len(coordinates) < 2:
#         return None

#     return {
#         "type": "LineString",
#         "coordinates": coordinates,
#     }


# def _get_track_azimuth_deg(
#     track_points: list[dict[str, Any]],
#     index: int,
#     center_lon: float,
# ) -> float | None:
#     """
#     Направление движения трассы в точке.
#     Для внутренней точки берём направление от предыдущей к следующей.
#     Для крайних — ближайший доступный сегмент.
#     """
#     if len(track_points) < 2:
#         return None

#     if index == 0:
#         point_a = track_points[0]
#         point_b = track_points[1]
#     elif index == len(track_points) - 1:
#         point_a = track_points[-2]
#         point_b = track_points[-1]
#     else:
#         point_a = track_points[index - 1]
#         point_b = track_points[index + 1]

#     lon_a = point_a.get("longitude")
#     lat_a = point_a.get("latitude")
#     lon_b = point_b.get("longitude")
#     lat_b = point_b.get("latitude")

#     if None in (lon_a, lat_a, lon_b, lat_b):
#         return None

#     lon_a = _normalize_longitude_near_center(lon_a, center_lon)
#     lon_b = _normalize_longitude_near_center(lon_b, center_lon)

#     forward_azimuth, _, _ = GEOD.inv(lon_a, lat_a, lon_b, lat_b)

#     return forward_azimuth


# def _offset_point(
#     longitude: float,
#     latitude: float,
#     azimuth_deg: float,
#     distance_m: float,
#     center_lon: float,
# ) -> list[float]:
#     offset_lon, offset_lat, _ = GEOD.fwd(
#         longitude,
#         latitude,
#         azimuth_deg,
#         distance_m,
#     )

#     offset_lon = _normalize_longitude_near_center(offset_lon, center_lon)

#     return [offset_lon, offset_lat]


# def build_footprint_corridor_geojson(
#     track_points: list[dict[str, Any]],
#     aoi_geojson: dict[str, Any],
#     swath_km: float | None,
# ) -> dict[str, Any] | None:
#     """
#     Геодезический corridor.

#     Вместо shapely.buffer строим две границы полосы:
#     - левая граница = точка трассы, смещённая на half_swath влево
#     - правая граница = точка трассы, смещённая на half_swath вправо

#     Это лучше для широких сенсоров, потому что ширина полосы задаётся
#     как постоянное геодезическое расстояние на поверхности Земли.
#     """
#     if swath_km is None:
#         return None

#     swath_km_float = float(swath_km)

#     if swath_km_float <= 0:
#         return None

#     if len(track_points) < 2:
#         return None

#     center_lon, _ = _get_aoi_centroid(aoi_geojson)
#     half_swath_m = (swath_km_float * 1000.0) / 2.0

#     left_edge: list[list[float]] = []
#     right_edge: list[list[float]] = []

#     for index, point in enumerate(track_points):
#         longitude = point.get("longitude")
#         latitude = point.get("latitude")

#         if longitude is None or latitude is None:
#             continue

#         longitude = _normalize_longitude_near_center(longitude, center_lon)

#         track_azimuth = _get_track_azimuth_deg(
#             track_points=track_points,
#             index=index,
#             center_lon=center_lon,
#         )

#         if track_azimuth is None:
#             continue

#         left_azimuth = track_azimuth - 90.0
#         right_azimuth = track_azimuth + 90.0

#         left_edge.append(
#             _offset_point(
#                 longitude=longitude,
#                 latitude=latitude,
#                 azimuth_deg=left_azimuth,
#                 distance_m=half_swath_m,
#                 center_lon=center_lon,
#             )
#         )

#         right_edge.append(
#             _offset_point(
#                 longitude=longitude,
#                 latitude=latitude,
#                 azimuth_deg=right_azimuth,
#                 distance_m=half_swath_m,
#                 center_lon=center_lon,
#             )
#         )

#     if len(left_edge) < 2 or len(right_edge) < 2:
#         return None

#     polygon_ring = left_edge + list(reversed(right_edge))

#     if polygon_ring[0] != polygon_ring[-1]:
#         polygon_ring.append(polygon_ring[0])

#     return {
#         "type": "Polygon",
#         "coordinates": [polygon_ring],
#     }



# from typing import Any

# from pyproj import Geod, Transformer
# from shapely.geometry import Point, shape
# from shapely.ops import transform

# GEOD = Geod(ellps="WGS84")


# def _get_aoi_centroid(aoi_geojson: dict[str, Any]) -> tuple[float, float]:
#     aoi_geometry = shape(aoi_geojson)
#     centroid = aoi_geometry.centroid
#     return centroid.x, centroid.y


# def _normalize_longitude_near_center(longitude: float, center_longitude: float) -> float:
#     normalized = longitude

#     while normalized - center_longitude > 180:
#         normalized -= 360

#     while normalized - center_longitude < -180:
#         normalized += 360

#     return normalized


# def _get_local_aeqd_transformer(aoi_geojson: dict[str, Any]) -> Transformer:
#     center_lon, center_lat = _get_aoi_centroid(aoi_geojson)

#     local_crs = (
#         f"+proj=aeqd +lat_0={center_lat} +lon_0={center_lon} "
#         "+datum=WGS84 +units=m +no_defs"
#     )

#     return Transformer.from_crs(
#         "EPSG:4326",
#         local_crs,
#         always_xy=True,
#     )


# def _project_aoi(aoi_geojson: dict[str, Any], to_local: Transformer):
#     return transform(to_local.transform, shape(aoi_geojson))


# def _distance_km_between_points(
#     lon1: float,
#     lat1: float,
#     lon2: float,
#     lat2: float,
# ) -> float:
#     _, _, distance_m = GEOD.inv(lon1, lat1, lon2, lat2)
#     return abs(distance_m) / 1000.0


# def _get_aoi_diagonal_km(aoi_geojson: dict[str, Any]) -> float:
#     aoi_geometry = shape(aoi_geojson)
#     min_lon, min_lat, max_lon, max_lat = aoi_geometry.bounds

#     _, _, distance_m = GEOD.inv(min_lon, min_lat, max_lon, max_lat)

#     return abs(distance_m) / 1000.0


# def _get_track_point_distance_to_aoi_m(
#     point: dict[str, Any],
#     projected_aoi,
#     to_local: Transformer,
#     center_lon: float,
# ) -> float | None:
#     longitude = point.get("longitude")
#     latitude = point.get("latitude")

#     if longitude is None or latitude is None:
#         return None

#     normalized_longitude = _normalize_longitude_near_center(longitude, center_lon)

#     x, y = to_local.transform(normalized_longitude, latitude)

#     return projected_aoi.distance(Point(x, y))


# def select_track_segment_near_aoi(
#     track_points: list[dict[str, Any]],
#     aoi_geojson: dict[str, Any],
#     swath_km: float | None = None,
#     min_segment_km: float = 250.0,
#     max_segment_km: float = 4500.0,
# ) -> list[dict[str, Any]]:
#     """
#     Адаптивно выбирает участок трассы около AOI.

#     Не берём фиксированные 2-3 точки, потому что:
#     - для маленькой AOI это может быть слишком много;
#     - для большой AOI это может быть слишком мало;
#     - для широкого сенсора нужен более длинный пояс визуализации.
#     """
#     if len(track_points) < 2:
#         return []

#     center_lon, _ = _get_aoi_centroid(aoi_geojson)
#     to_local = _get_local_aeqd_transformer(aoi_geojson)
#     projected_aoi = _project_aoi(aoi_geojson, to_local)

#     best_index: int | None = None
#     best_distance_m: float | None = None

#     for index, point in enumerate(track_points):
#         distance_m = _get_track_point_distance_to_aoi_m(
#             point=point,
#             projected_aoi=projected_aoi,
#             to_local=to_local,
#             center_lon=center_lon,
#         )

#         if distance_m is None:
#             continue

#         if best_distance_m is None or distance_m < best_distance_m:
#             best_distance_m = distance_m
#             best_index = index

#     if best_index is None:
#         return []

#     aoi_diagonal_km = _get_aoi_diagonal_km(aoi_geojson)

#     swath_value_km = float(swath_km) if swath_km is not None else 0.0

#     # Длина визуального сегмента:
#     # - зависит от размера AOI;
#     # - зависит от ширины полосы;
#     # - но ограничена сверху, чтобы не рисовать половину орбиты.
#     target_segment_km = max(
#         min_segment_km,
#         aoi_diagonal_km * 1.2,
#         swath_value_km * 0.75,
#     )

#     target_segment_km = min(target_segment_km, max_segment_km)

#     target_each_side_km = target_segment_km / 2.0

#     start_index = best_index
#     end_index = best_index

#     distance_left_km = 0.0

#     while start_index > 0 and distance_left_km < target_each_side_km:
#         current = track_points[start_index]
#         previous = track_points[start_index - 1]

#         current_lon = current.get("longitude")
#         current_lat = current.get("latitude")
#         previous_lon = previous.get("longitude")
#         previous_lat = previous.get("latitude")

#         if None in (current_lon, current_lat, previous_lon, previous_lat):
#             break

#         distance_left_km += _distance_km_between_points(
#             previous_lon,
#             previous_lat,
#             current_lon,
#             current_lat,
#         )

#         start_index -= 1

#     distance_right_km = 0.0

#     while end_index < len(track_points) - 1 and distance_right_km < target_each_side_km:
#         current = track_points[end_index]
#         next_point = track_points[end_index + 1]

#         current_lon = current.get("longitude")
#         current_lat = current.get("latitude")
#         next_lon = next_point.get("longitude")
#         next_lat = next_point.get("latitude")

#         if None in (current_lon, current_lat, next_lon, next_lat):
#             break

#         distance_right_km += _distance_km_between_points(
#             current_lon,
#             current_lat,
#             next_lon,
#             next_lat,
#         )

#         end_index += 1

#     segment = track_points[start_index : end_index + 1]

#     if len(segment) < 2:
#         return []

#     return segment


# def build_track_line_geojson(
#     track_points: list[dict[str, Any]],
#     aoi_geojson: dict[str, Any] | None = None,
# ) -> dict[str, Any] | None:
#     if len(track_points) < 2:
#         return None

#     center_lon = None

#     if aoi_geojson is not None:
#         center_lon, _ = _get_aoi_centroid(aoi_geojson)

#     coordinates: list[list[float]] = []

#     for point in track_points:
#         longitude = point.get("longitude")
#         latitude = point.get("latitude")

#         if longitude is None or latitude is None:
#             continue

#         if center_lon is not None:
#             longitude = _normalize_longitude_near_center(longitude, center_lon)

#         coordinates.append([longitude, latitude])

#     if len(coordinates) < 2:
#         return None

#     return {
#         "type": "LineString",
#         "coordinates": coordinates,
#     }


# def _get_track_azimuth_deg(
#     track_points: list[dict[str, Any]],
#     index: int,
#     center_lon: float,
# ) -> float | None:
#     """
#     Направление движения трассы в точке.
#     Для внутренней точки берём направление от предыдущей к следующей.
#     Для крайних — ближайший доступный сегмент.
#     """
#     if len(track_points) < 2:
#         return None

#     if index == 0:
#         point_a = track_points[0]
#         point_b = track_points[1]
#     elif index == len(track_points) - 1:
#         point_a = track_points[-2]
#         point_b = track_points[-1]
#     else:
#         point_a = track_points[index - 1]
#         point_b = track_points[index + 1]

#     lon_a = point_a.get("longitude")
#     lat_a = point_a.get("latitude")
#     lon_b = point_b.get("longitude")
#     lat_b = point_b.get("latitude")

#     if None in (lon_a, lat_a, lon_b, lat_b):
#         return None

#     lon_a = _normalize_longitude_near_center(lon_a, center_lon)
#     lon_b = _normalize_longitude_near_center(lon_b, center_lon)

#     forward_azimuth, _, _ = GEOD.inv(lon_a, lat_a, lon_b, lat_b)

#     return forward_azimuth


# def _offset_point(
#     longitude: float,
#     latitude: float,
#     azimuth_deg: float,
#     distance_m: float,
#     center_lon: float,
# ) -> list[float]:
#     offset_lon, offset_lat, _ = GEOD.fwd(
#         longitude,
#         latitude,
#         azimuth_deg,
#         distance_m,
#     )

#     offset_lon = _normalize_longitude_near_center(offset_lon, center_lon)

#     return [offset_lon, offset_lat]


# def build_footprint_corridor_geojson(
#     track_points: list[dict[str, Any]],
#     aoi_geojson: dict[str, Any],
#     swath_km: float | None,
# ) -> dict[str, Any] | None:
#     """
#     Геодезический corridor.

#     Вместо shapely.buffer строим две границы полосы:
#     - левая граница = точка трассы, смещённая на half_swath влево
#     - правая граница = точка трассы, смещённая на half_swath вправо

#     Это лучше для широких сенсоров, потому что ширина полосы задаётся
#     как постоянное геодезическое расстояние на поверхности Земли.
#     """
#     if swath_km is None:
#         return None

#     swath_km_float = float(swath_km)

#     if swath_km_float <= 0:
#         return None

#     if len(track_points) < 2:
#         return None

#     center_lon, _ = _get_aoi_centroid(aoi_geojson)
#     half_swath_m = (swath_km_float * 1000.0) / 2.0

#     left_edge: list[list[float]] = []
#     right_edge: list[list[float]] = []

#     for index, point in enumerate(track_points):
#         longitude = point.get("longitude")
#         latitude = point.get("latitude")

#         if longitude is None or latitude is None:
#             continue

#         longitude = _normalize_longitude_near_center(longitude, center_lon)

#         track_azimuth = _get_track_azimuth_deg(
#             track_points=track_points,
#             index=index,
#             center_lon=center_lon,
#         )

#         if track_azimuth is None:
#             continue

#         left_azimuth = track_azimuth - 90.0
#         right_azimuth = track_azimuth + 90.0

#         left_edge.append(
#             _offset_point(
#                 longitude=longitude,
#                 latitude=latitude,
#                 azimuth_deg=left_azimuth,
#                 distance_m=half_swath_m,
#                 center_lon=center_lon,
#             )
#         )

#         right_edge.append(
#             _offset_point(
#                 longitude=longitude,
#                 latitude=latitude,
#                 azimuth_deg=right_azimuth,
#                 distance_m=half_swath_m,
#                 center_lon=center_lon,
#             )
#         )

#     if len(left_edge) < 2 or len(right_edge) < 2:
#         return None

#     polygon_ring = left_edge + list(reversed(right_edge))

#     if polygon_ring[0] != polygon_ring[-1]:
#         polygon_ring.append(polygon_ring[0])

#     return {
#         "type": "Polygon",
#         "coordinates": [polygon_ring],
#     }

