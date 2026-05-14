import { useParams } from 'react-router-dom'

export default function SavedCalculationPage() {
  const { calculationId } = useParams()

  return (
    <section className="page-card">
      <h2>Сохраненный расчет</h2>
      <p>Идентификатор расчета: {calculationId}</p>
      <p>В прототипе страница готова для открытия результатов по прямой ссылке.</p>
    </section>
  )
}
