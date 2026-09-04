'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function SiteHeader() {
  const pathname = usePathname()
  const isProjectRoute = pathname !== '/' && pathname !== '/create' && pathname !== '/select'
  if (isProjectRoute) return null

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand" aria-label="Loqon ホーム">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-word">Loqon</span>
        </Link>
        <span className="header-note">formation practice / stage console</span>
      </div>
    </header>
  )
}
