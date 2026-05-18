import { useEffect, useMemo, useState } from 'react'
import { fetchSatelliteSensors, fetchSatellites } from '../api/satellites'
import type { Satellite, Sensor } from '../types/satellite'

export default function SatellitesPage() {
  const [satellites, setSatellites] = useState<Satellite[]>([])
  const [selectedSatelliteId, setSelectedSatelliteId] = useState<number | null>(null)
  const [sensors, setSensors] = useState<Sensor[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingSensors, setIsLoadingSensors] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadSatellites() {
      try {
        setIsLoading(true)
        setError('')

        const data = await fetchSatellites()
        setSatellites(data)

        if (data.length > 0) {
          setSelectedSatelliteId(data[0].satellite_id)
        }
      } catch (err) {
        console.error(err)
        setError('Не удалось загрузить каталог спутников')
      } finally {
        setIsLoading(false)
      }
    }

    loadSatellites()
  }, [])

  useEffect(() => {
    async function loadSensors() {
      if (!selectedSatelliteId) {
        setSensors([])
        return
      }

      try {
        setIsLoadingSensors(true)
        const data = await fetchSatelliteSensors(selectedSatelliteId)
        setSensors(data)
      } catch (err) {
        console.error(err)
        setSensors([])
      } finally {
        setIsLoadingSensors(false)
      }
    }

    loadSensors()
  }, [selectedSatelliteId])

  const filteredSatellites = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    if (!query) {
      return satellites
    }

    return satellites.filter((satellite) =>
      [
        satellite.name,
        satellite.country,
        satellite.mission_type,
        satellite.orbit_type,
        satellite.object_id,
        String(satellite.norad_id),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    )
  }, [satellites, searchQuery])

  const selectedSatellite = useMemo(() => {
    return satellites.find((item) => item.satellite_id === selectedSatelliteId) ?? null
  }, [satellites, selectedSatelliteId])

  return (
    <main className="satellite-catalog-page">
      <aside className="satellite-catalog-sidebar">
        <div className="catalog-title">Каталог спутников</div>

        <input
          className="catalog-search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Поиск спутника..."
        />

        {isLoading && <div className="hint">Загрузка каталога...</div>}
        {error && <div className="error-box">{error}</div>}

        <div className="satellite-list">
          {filteredSatellites.map((satellite) => (
            <button
              key={satellite.satellite_id}
              type="button"
              className={`satellite-list-item ${
                selectedSatelliteId === satellite.satellite_id ? 'active' : ''
              }`}
              onClick={() => setSelectedSatelliteId(satellite.satellite_id)}
            >
              <span className="satellite-dot" />
              <span>
                <strong>{satellite.name}</strong>
                <small>
                  {satellite.country ?? '—'} · NORAD {satellite.norad_id}
                </small>
              </span>
            </button>
          ))}
        </div>

        <div className="catalog-footer">
          {filteredSatellites.length} из {satellites.length} спутников
        </div>
      </aside>

      <section className="satellite-details-area">
        {!selectedSatellite && !isLoading && (
          <div className="page-card">
            <h2>Спутник не выбран</h2>
            <p>Выберите аппарат из каталога слева.</p>
          </div>
        )}

        {selectedSatellite && (
          <>
            <div className="satellite-hero">
              <div className="satellite-icon">✣</div>

              <div>
                <h2>{selectedSatellite.name}</h2>

                <div className="satellite-tags">
                  <span>{selectedSatellite.country ?? 'Оператор не указан'}</span>
                </div>
              </div>
            </div>

            <section className="satellite-section-card">
              <h3>Параметры спутника</h3>

              <div className="satellite-kv-list">
                <ParameterRow label="Наименование" value={selectedSatellite.name} />
                <ParameterRow label="Страна / оператор" value={selectedSatellite.country ?? '—'} />
                <ParameterRow label="Тип миссии" value={selectedSatellite.mission_type} />
                <ParameterRow label="NORAD ID" value={selectedSatellite.norad_id} />
                <ParameterRow label="Object ID" value={selectedSatellite.object_id ?? '—'} />
                <ParameterRow label="Тип орбиты" value={selectedSatellite.orbit_type ?? '—'} />
                <ParameterRow
                  label="Наклонение орбиты"
                  value={
                    selectedSatellite.inclination_deg !== null
                      ? `${selectedSatellite.inclination_deg}°`
                      : '—'
                  }
                />
                <ParameterRow
                  label="Период обращения"
                  value={
                    selectedSatellite.orbital_period_min !== null
                      ? `${selectedSatellite.orbital_period_min} мин`
                      : '—'
                  }
                />
                <ParameterRow
                  label="Средняя высота орбиты"
                  value={
                    selectedSatellite.avg_altitude_km !== null
                      ? `${selectedSatellite.avg_altitude_km} км`
                      : '—'
                  }
                />
                <ParameterRow
                  label="Описание"
                  value={
                    selectedSatellite.description ??
                    'Описание спутника пока не заполнено в справочнике.'
                  }
                  multiline
                />
              </div>
            </section>

            <section className="satellite-section-card">
              <div className="section-heading-row">
                <h3>Сенсоры</h3>
                <span className="catalog-counter">
                  {isLoadingSensors ? 'Загрузка...' : `${sensors.length} сенсор(ов)`}
                </span>
              </div>

              {sensors.length === 0 && !isLoadingSensors && (
                <p className="muted-text">Для выбранного спутника сенсоры не найдены.</p>
              )}

              {sensors.length > 0 && (
                <div className="sensor-grid">
                  {sensors.map((sensor) => (
                    <div key={sensor.sensor_id} className="sensor-card">
                      <div className="sensor-card-header">
                        <strong>{sensor.name}</strong>
                        <span>{sensor.sensor_type}</span>
                      </div>

                      <div className="sensor-card-body">
                        <div>
                          <span>Полоса захвата</span>
                          <strong>
                            {sensor.swath_km !== null ? `${sensor.swath_km} км` : '—'}
                          </strong>
                        </div>

                        <div>
                          <span>Разрешение</span>
                          <strong>{formatResolutions(sensor)}</strong>
                        </div>

                        <div>
                          <span>Диапазоны</span>
                          <strong>{sensor.bands.length}</strong>
                        </div>
                      </div>

                      {sensor.bands.length > 0 && (
                        <div className="sensor-bands-list">
                          {sensor.bands.map((band) => (
                            <div key={band.band_id}>
                              <span>{band.band_name}</span>
                              <strong>{band.spatial_resolution_m} м</strong>
                            </div>
                          ))}
                        </div>
                      )}

                      {sensor.notes && <p>{sensor.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  )
}

function formatResolutions(sensor: Sensor) {
  if (!sensor.bands.length) {
    return '—'
  }

  const resolutions = Array.from(
    new Set(sensor.bands.map((band) => band.spatial_resolution_m)),
  ).sort((a, b) => a - b)

  return `${resolutions.join(' / ')} м`
}

function ParameterRow({
  label,
  value,
  multiline = false,
}: {
  label: string
  value: string | number
  multiline?: boolean
}) {
  return (
    <div className={`satellite-kv-row ${multiline ? 'multiline' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

// import { useEffect, useMemo, useState } from 'react'
// import { fetchSatelliteSensors, fetchSatellites } from '../api/satellites'
// import type { Satellite, Sensor } from '../types/satellite'

// export default function SatellitesPage() {
//   const [satellites, setSatellites] = useState<Satellite[]>([])
//   const [selectedSatelliteId, setSelectedSatelliteId] = useState<number | null>(null)
//   const [sensors, setSensors] = useState<Sensor[]>([])
//   const [searchQuery, setSearchQuery] = useState('')
//   const [isLoading, setIsLoading] = useState(false)
//   const [isLoadingSensors, setIsLoadingSensors] = useState(false)
//   const [error, setError] = useState('')

//   useEffect(() => {
//     async function loadSatellites() {
//       try {
//         setIsLoading(true)
//         setError('')

//         const data = await fetchSatellites()
//         setSatellites(data)

//         if (data.length > 0) {
//           setSelectedSatelliteId(data[0].satellite_id)
//         }
//       } catch (err) {
//         console.error(err)
//         setError('Не удалось загрузить каталог спутников')
//       } finally {
//         setIsLoading(false)
//       }
//     }

//     loadSatellites()
//   }, [])

//   useEffect(() => {
//     async function loadSensors() {
//       if (!selectedSatelliteId) {
//         setSensors([])
//         return
//       }

//       try {
//         setIsLoadingSensors(true)
//         const data = await fetchSatelliteSensors(selectedSatelliteId)
//         setSensors(data)
//       } catch (err) {
//         console.error(err)
//         setSensors([])
//       } finally {
//         setIsLoadingSensors(false)
//       }
//     }

//     loadSensors()
//   }, [selectedSatelliteId])

//   const filteredSatellites = useMemo(() => {
//     const query = searchQuery.trim().toLowerCase()

//     if (!query) {
//       return satellites
//     }

//     return satellites.filter((satellite) =>
//       [
//         satellite.name,
//         satellite.country,
//         satellite.mission_type,
//         satellite.orbit_type,
//         satellite.object_id,
//         String(satellite.norad_id),
//       ]
//         .filter(Boolean)
//         .some((value) => String(value).toLowerCase().includes(query)),
//     )
//   }, [satellites, searchQuery])

//   const selectedSatellite = useMemo(() => {
//     return satellites.find((item) => item.satellite_id === selectedSatelliteId) ?? null
//   }, [satellites, selectedSatelliteId])

//   return (
//     <main className="satellite-catalog-page">
//       <aside className="satellite-catalog-sidebar">
//         <div className="catalog-title">Каталог спутников</div>

//         <input
//           className="catalog-search"
//           value={searchQuery}
//           onChange={(event) => setSearchQuery(event.target.value)}
//           placeholder="Поиск спутника..."
//         />

//         {isLoading && <div className="hint">Загрузка каталога...</div>}
//         {error && <div className="error-box">{error}</div>}

//         <div className="satellite-list">
//           {filteredSatellites.map((satellite) => (
//             <button
//               key={satellite.satellite_id}
//               type="button"
//               className={`satellite-list-item ${
//                 selectedSatelliteId === satellite.satellite_id ? 'active' : ''
//               }`}
//               onClick={() => setSelectedSatelliteId(satellite.satellite_id)}
//             >
//               <span className="satellite-dot" />
//               <span>
//                 <strong>{satellite.name}</strong>
//                 <small>
//                   {satellite.country ?? '—'} · NORAD {satellite.norad_id}
//                 </small>
//               </span>
//             </button>
//           ))}
//         </div>

//         <div className="catalog-footer">
//           {filteredSatellites.length} из {satellites.length} спутников
//         </div>
//       </aside>

//       <section className="satellite-details-area">
//         {!selectedSatellite && !isLoading && (
//           <div className="page-card">
//             <h2>Спутник не выбран</h2>
//             <p>Выберите аппарат из каталога слева.</p>
//           </div>
//         )}

//         {selectedSatellite && (
//           <>
//             <div className="satellite-hero">
//               <div className="satellite-icon">✣</div>

//               <div>
//                 <h2>{selectedSatellite.name}</h2>

//                 <div className="satellite-tags">
//                   <span>{selectedSatellite.country ?? 'Оператор не указан'}</span>
//                   <span>{selectedSatellite.mission_type}</span>
//                 </div>
//               </div>
//             </div>

//             <section className="satellite-section-card">
//               <h3>Ключевые параметры</h3>

//               <div className="satellite-info-grid compact">
//                 <InfoCard title="NORAD ID" value={selectedSatellite.norad_id} />
//                 <InfoCard title="Object ID" value={selectedSatellite.object_id ?? '—'} />
//                 <InfoCard title="Тип орбиты" value={selectedSatellite.orbit_type ?? '—'} />
//                 <InfoCard
//                   title="Наклонение"
//                   value={
//                     selectedSatellite.inclination_deg !== null
//                       ? `${selectedSatellite.inclination_deg}°`
//                       : '—'
//                   }
//                 />
//                 <InfoCard
//                   title="Период обращения"
//                   value={
//                     selectedSatellite.orbital_period_min !== null
//                       ? `${selectedSatellite.orbital_period_min} мин`
//                       : '—'
//                   }
//                 />
//                 <InfoCard
//                   title="Средняя высота"
//                   value={
//                     selectedSatellite.avg_altitude_km !== null
//                       ? `${selectedSatellite.avg_altitude_km} км`
//                       : '—'
//                   }
//                 />
//               </div>
//             </section>

//             <section className="satellite-section-card">
//               <h3>Описание</h3>

//               <p className="satellite-description">
//                 {selectedSatellite.description ??
//                   'Описание спутника пока не заполнено в справочнике.'}
//               </p>
//             </section>

//             <section className="satellite-section-card">
//               <div className="section-heading-row">
//                 <h3>Сенсоры</h3>
//                 <span className="catalog-counter">
//                   {isLoadingSensors ? 'Загрузка...' : `${sensors.length} сенсор(ов)`}
//                 </span>
//               </div>

//               {sensors.length === 0 && !isLoadingSensors && (
//                 <p className="muted-text">Для выбранного спутника сенсоры не найдены.</p>
//               )}

//               {sensors.length > 0 && (
//                 <div className="sensor-grid">
//                   {sensors.map((sensor) => (
//                     <div key={sensor.sensor_id} className="sensor-card">
//                       <div className="sensor-card-header">
//                         <strong>{sensor.name}</strong>
//                         <span>{sensor.sensor_type}</span>
//                       </div>

//                       <div className="sensor-card-body">
//                         <div>
//                           <span>Полоса захвата</span>
//                           <strong>
//                             {sensor.swath_km !== null ? `${sensor.swath_km} км` : '—'}
//                           </strong>
//                         </div>

//                         <div>
//                           <span>Макс. отклонение</span>
//                           <strong>
//                             {sensor.off_nadir_max_deg !== null
//                               ? `${sensor.off_nadir_max_deg}°`
//                               : '—'}
//                           </strong>
//                         </div>

//                         <div>
//                           <span>Перенацеливание</span>
//                           <strong>
//                             {sensor.retarget_time_sec !== null
//                               ? `${sensor.retarget_time_sec} сек`
//                               : '—'}
//                           </strong>
//                         </div>
//                       </div>

//                       {sensor.notes && <p>{sensor.notes}</p>}
//                     </div>
//                   ))}
//                 </div>
//               )}
//             </section>
//           </>
//         )}
//       </section>
//     </main>
//   )
// }

// function InfoCard({ title, value }: { title: string; value: string | number }) {
//   return (
//     <div className="satellite-info-card">
//       <span>{title}</span>
//       <strong>{value}</strong>
//     </div>
//   )
// }