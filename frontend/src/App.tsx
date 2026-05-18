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

            <div className="modal-content">
              <h3>1. Задайте область интереса AOI</h3>
              <p>
                Выберите участок местности на карте и задайте область интереса в виде полигона.
                Эта область будет использоваться системой для анализа возможности спутникового наблюдения.
              </p>

              <h3>2. Укажите период расчёта</h3>
              <p>
                Выберите дату начала и дату окончания анализа. Максимальный период расчёта в прототипе —
                7 суток. Чем меньше шаг расчёта, тем выше точность, но тем больше время обработки.
              </p>

              <h3>3. Выберите спутники</h3>
              <p>
                Можно выполнить расчёт по всему каталогу спутников или выбрать отдельные аппараты вручную
                для сравнения их доступности, сенсоров и характеристик наблюдения.
              </p>

              <h3>4. Обновите TLE-данные</h3>
              <p>
                Кнопка обновления TLE загружает актуальные орбитальные данные из CelesTrak и сохраняет их
                в базе данных. Эти данные используются при последующих расчётах движения спутников.
              </p>

              <h3>5. Запустите расчёт</h3>
              <p>
                После запуска система создаёт расчёт, связывает его с выбранной областью, спутниками и
                актуальными TLE-записями, после чего определяет окна возможного наблюдения территории.
              </p>

              <h3>6. Работайте с результатами</h3>
              <p>
                Результаты отображаются в виде таблицы окон наблюдения, статистики и сравнительных
                характеристик спутников. Их можно свернуть для просмотра карты, экспортировать в CSV,
                скопировать ссылку на расчёт или повторно открыть сохранённый результат через кнопку
                «По ссылке».
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