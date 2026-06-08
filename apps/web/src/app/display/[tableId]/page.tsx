'use client'

import { use } from 'react'
import dynamic from 'next/dynamic'

const DisplayScene = dynamic(
  () => import('@/components/scene/DisplayScene'),
  { ssr: false },
)

export default function DisplayPage({
  params,
}: {
  params: Promise<{ tableId: string }>
}) {
  const { tableId } = use(params)
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <DisplayScene tableId={tableId} />
    </div>
  )
}
