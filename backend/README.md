# Backend (FastAPI)

Прототип backend-части web-GIS для планирования съемки спутниками ДЗЗ.

## Запуск

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

## Переменные окружения

- `DATABASE_URL` — URL подключения к PostgreSQL/PostGIS
- `APP_NAME` — имя приложения
- `DEBUG` — режим отладки

## Ограничения текущего прототипа

- Реализованы только базовые CRUD/API-заготовки.
- Полный расчет окон наблюдения, SGP4 и анализ видимости пока не реализованы.
- Эндпоинт `/api/calculations` возвращает placeholder-ответ.
