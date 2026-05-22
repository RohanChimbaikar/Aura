import type { ReactNode } from 'react'
import { Panel } from '../../AuraPrimitives'
import { cn } from '../../../lib/utils'
import { cardTitleClass, cardSubtitleClass } from '../utils/formatting'

export function EvidenceCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string
  subtitle: string
  children: ReactNode
  className?: string
}) {
  return (
    <Panel className={cn('p-5 lg:p-6', className)}>
      <div className="mb-4">
        <div className={cardTitleClass()}>{title}</div>
        <div className={cardSubtitleClass()}>{subtitle}</div>
      </div>
      {children}
    </Panel>
  )
}
