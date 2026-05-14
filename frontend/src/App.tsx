import { Link, Navigate, Route, Routes } from 'react-router-dom'
import AboutPage from './pages/AboutPage'
import MainPage from './pages/MainPage'
import SatellitesPage from './pages/SatellitesPage'
import SavedCalculationPage from './pages/SavedCalculationPage'

export default function App() {
  return (
    <div className="app-shell">
      <header className="top-header">
        <div className="brand">Планирование спутниковой съемки</div>
        <nav className="top-nav">
          <Link to="/calculation">Расчет</Link>
          <Link to="/satellites">Спутники</Link>
          <Link to="/about">О системе</Link>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<Navigate to="/calculation" replace />} />
        <Route path="/calculation" element={<MainPage />} />
        <Route path="/satellites" element={<SatellitesPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/saved/:calculationId" element={<SavedCalculationPage />} />
      </Routes>
    </div>
  )
}
