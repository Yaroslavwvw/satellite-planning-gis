# satellite-planning-gis

Прототип full-stack web-GIS системы для планирования спутниковой съемки Земли на основе орбитальных данных.

## Структура

- `backend/` — FastAPI + SQLAlchemy + PostGIS scaffold
- `frontend/` — React + TypeScript + Vite + Leaflet scaffold
- `db/` — reference SQL notes

## Запуск backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

Health-check: `GET http://localhost:8000/health`

## Запуск frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend по умолчанию ожидает backend на `http://localhost:8000`.

## Переменные окружения backend

- `DATABASE_URL=postgresql+psycopg://user:password@localhost:5432/test_1`
- `APP_NAME=satellite-planning-gis-backend`
- `DEBUG=false`

## Ограничения текущего прототипа

- Нет регистрации/авторизации (по требованиям прототипа).
- Расчет окон наблюдения реализован как placeholder (без полного SGP4/visibility pipeline).
- TLE update реализован как безопасный базовый skeleton для дальнейшего развития.
- Интерфейс минимальный, без финальной стилизации.
