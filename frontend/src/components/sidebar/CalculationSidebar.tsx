export default function CalculationSidebar() {
  return (
    <aside className="sidebar">
      <div className="section-title">Параметры расчета</div>

      <div className="section-title">AOI</div>
      <label htmlFor="aoiName">Название AOI</label>
      <input id="aoiName" placeholder="Например: Полигон №1" />

      <div className="section-title">Период расчета</div>
      <label htmlFor="periodStart">Дата начала</label>
      <input id="periodStart" type="date" />
      <label htmlFor="periodEnd">Дата окончания (до 7 дней)</label>
      <input id="periodEnd" type="date" />

      <div className="section-title">Спутники</div>
      <label htmlFor="satellites">Выбор спутника</label>
      <select id="satellites">
        <option>Будет загружено из API</option>
      </select>

      <div className="section-title">Настройки</div>
      <label htmlFor="step">Шаг расчета (сек)</label>
      <input id="step" type="number" defaultValue={30} min={1} />

      <button type="button">Рассчитать</button>
    </aside>
  )
}
