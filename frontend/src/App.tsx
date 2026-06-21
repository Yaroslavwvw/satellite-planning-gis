import { FormEvent, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import AboutPage from './pages/AboutPage'
import MainPage from './pages/MainPage'
import SatellitesPage from './pages/SatellitesPage'
import SavedCalculationPage from './pages/SavedCalculationPage'
import ResultsDetailPage from './pages/ResultsDetailPage'
import {
  CalculationProvider,
  useCalculationContext,
} from './context/CalculationContext'

export default function App() {
  return (
    <CalculationProvider>
      <AppContent />
    </CalculationProvider>
  )
}

function AppContent() {
  const navigate = useNavigate()
  const { currentCalculationId, currentResult } = useCalculationContext()

  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [isOpenByLinkOpen, setIsOpenByLinkOpen] = useState(false)
  const [calculationLink, setCalculationLink] = useState('')

  function handleOpenCalculation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedValue = calculationLink.trim()

    if (!trimmedValue) {
      return
    }

    const match = trimmedValue.match(/saved\/(\d+)|results\/(\d+)|^(\d+)$/)
    const calculationId = match?.[1] ?? match?.[2] ?? match?.[3]

    if (!calculationId) {
      alert('Введите ID расчёта или ссылку вида /saved/3')
      return
    }

    setIsOpenByLinkOpen(false)
    setCalculationLink('')
    navigate(`/saved/${calculationId}`)
  }

  return (
    <div className="app-shell">
      <header className="top-header">
        <div className="brand">
          <span className="brand-icon">✣</span>
          <span>ГИС-ДЗЗ</span>
          <span className="brand-subtitle">Система планирования съёмки</span>
        </div>

        <nav className="top-nav">
          <Link to="/calculation">Расчёт</Link>
          <Link to="/satellites">Спутники</Link>
          <Link to="/about">О системе</Link>
          <Link to="/results">Блок результатов</Link>
        </nav>

        <div className="top-actions">
          {currentCalculationId && (
            <span className="current-result-badge">
              Расчёт №{currentCalculationId}
              {currentResult?.aoi?.name ? ` · ${currentResult.aoi.name}` : ''}
            </span>
          )}

          <button
            type="button"
            className="top-action-button"
            onClick={() => setIsOpenByLinkOpen(true)}
          >
            🔗 По ссылке
          </button>

          <button
            type="button"
            className="help-button"
            aria-label="Справка"
            onClick={() => setIsHelpOpen(true)}
          >
            ?
          </button>
        </div>
      </header>

      <Routes>
        <Route path="/" element={<Navigate to="/calculation" replace />} />
        <Route path="/calculation" element={<MainPage />} />
        <Route path="/satellites" element={<SatellitesPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/results" element={<ResultsDetailPage />} />
        <Route path="/saved/:calculationId" element={<SavedCalculationPage />} />
      </Routes>

      {isHelpOpen && (
        <div className="modal-backdrop" onClick={() => setIsHelpOpen(false)}>
          <div className="help-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>Справка по работе с системой</h2>
              <button type="button" onClick={() => setIsHelpOpen(false)}>
                ×
              </button>
            </div>

            <div className="modal-content help-content">
              <h3>1. Задайте область интереса</h3>
              <p>
                Укажите название области и поставьте на карте не менее трёх точек.
                Система автоматически соединит их в полигон AOI. При необходимости
                область можно очистить и задать заново.
              </p>

              <h3>2. Выберите период расчёта</h3>
              <p>
                Укажите дату начала и окончания расчёта. Начальная дата не может быть
                раньше текущей, а конечная — позже седьмого дня от текущей даты.
                Дата окончания должна быть позже даты начала.
              </p>

              <h3>3. Выберите спутники</h3>
              <p>
                Можно выполнить расчёт по всему каталогу или выбрать отдельные спутники
                вручную. Чем больше спутников и продолжительнее период, тем больше
                времени может занять обработка.
              </p>

              <h3>4. Задайте параметры наблюдения</h3>
              <p>
                При необходимости включите съёмку с отклонением от надира и укажите
                допустимый угол. Для радиолокационных спутников можно выбрать сторону
                обзора: левую, правую или обе.
              </p>

              <h3>5. Проверьте TLE-данные</h3>
              <p>
                Перед расчётом можно обновить орбитальные данные спутников. Для
                вычислений используются актуальные TLE-записи, загруженные из CelesTrak.
              </p>

              <h3>6. Запустите расчёт</h3>
              <p>
                Нажмите кнопку «Рассчитать». Система определит временные окна
                наблюдения AOI, рассчитает покрытие территории и сохранит результат.
              </p>

              <h3>7. Изучите результаты</h3>
              <p>
                В таблице отображаются спутник, сенсор, время начала и окончания окна,
                длительность, разрешение и процент покрытия AOI. Время приводится в UTC
                и в местном часовом поясе области интереса.
              </p>

              <p>
                Нажмите на строку таблицы, чтобы показать на карте трассу спутника,
                полосу покрытия сенсора и расширенный буфер при боковом наведении.
                Результаты можно отфильтровать, экспортировать в CSV или повторно открыть
                по сохранённой ссылке.
              </p>
            </div>
          </div>
        </div>
      )}

      {isOpenByLinkOpen && (
        <div className="modal-backdrop" onClick={() => setIsOpenByLinkOpen(false)}>
          <form
            className="link-modal"
            onSubmit={handleOpenCalculation}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Открыть расчёт по ссылке</h2>
              <button type="button" onClick={() => setIsOpenByLinkOpen(false)}>
                ×
              </button>
            </div>

            <div className="modal-content">
              <p>Введите ID расчёта или вставьте ссылку вида:</p>
              <code>http://localhost:5173/saved/3</code>

              <input
                value={calculationLink}
                onChange={(event) => setCalculationLink(event.target.value)}
                placeholder="Например: 3 или /saved/3"
                autoFocus
              />

              <button type="submit" className="modal-primary-button">
                Открыть расчёт
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}