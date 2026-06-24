import type { ReactNode } from 'react'

type Props = {
  sidebar: ReactNode
  map: ReactNode
  results: ReactNode
  isResultsCollapsed?: boolean
}

export default function MainLayout({
  sidebar,
  map,
  results,
  isResultsCollapsed = false,
}: Props) {
  return (
    <main className={`main-layout ${isResultsCollapsed ? 'results-collapsed' : ''}`}>
      {sidebar}
      {map}
      {results}
    </main>
  )
}