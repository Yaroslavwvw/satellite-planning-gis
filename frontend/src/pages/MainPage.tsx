import MainLayout from '../components/layout/MainLayout'
import MapPanel from '../components/map/MapPanel'
import ResultsPanel from '../components/results/ResultsPanel'
import CalculationSidebar from '../components/sidebar/CalculationSidebar'

export default function MainPage() {
  return <MainLayout sidebar={<CalculationSidebar />} map={<MapPanel />} results={<ResultsPanel />} />
}
