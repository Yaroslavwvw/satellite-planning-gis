import type { ReactNode } from 'react'

interface MainLayoutProps {
  sidebar: ReactNode
  map: ReactNode
  results: ReactNode
}

export default function MainLayout({ sidebar, map, results }: MainLayoutProps) {
  return (
    <main className="main-layout">
      {sidebar}
      {map}
      {results}
    </main>
  )
}
