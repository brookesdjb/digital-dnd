'use client'

import { use } from 'react'
import dynamic from 'next/dynamic'

const ControlScene = dynamic(
  () => import('@/components/scene/ControlScene'),
  { ssr: false },
)

export default function ControlPage({
  params,
}: {
  params: Promise<{ tableId: string }>
}) {
  const { tableId } = use(params)
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ControlScene tableId={tableId} />
    </div>
  )
}
