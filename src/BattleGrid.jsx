import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import * as THREE from 'three'

// 16:9 TV sizes: diagonal → physical width × height in inches
export const SCREEN_SIZES = {
  '14"':  { w: 12.2, h:  6.9 },
  '16"':  { w: 13.9, h:  7.8 },
  '23"':  { w: 20.0, h: 11.3 },
  '32"':  { w: 27.9, h: 15.7 },
  '40"':  { w: 34.9, h: 19.6 },
  '43"':  { w: 37.5, h: 21.1 },
  '50"':  { w: 43.6, h: 24.5 },
  '55"':  { w: 47.9, h: 27.0 },
  '65"':  { w: 56.7, h: 31.9 },
  '75"':  { w: 65.4, h: 36.8 },
  '85"':  { w: 74.0, h: 41.6 },
}
export const SCREEN_SIZE_LABELS = Object.keys(SCREEN_SIZES)

// 1 world unit = 1 inch = 1 D&D grid square
// Minor lines every 1 unit, major lines every 5 units (= 5-foot DnD squares)
export function BattleGrid({ screenW, screenH, visible, showBorder = true }) {
  const borderPoints = useMemo(() => {
    const hw = screenW / 2, hh = screenH / 2, y = 0.05
    return [
      [-hw, y, -hh],
      [ hw, y, -hh],
      [ hw, y,  hh],
      [-hw, y,  hh],
      [-hw, y, -hh],
    ]
  }, [screenW, screenH])

  const { minorGeo, majorGeo } = useMemo(() => {
    const hw = Math.ceil(screenW / 2) + 1
    const hh = Math.ceil(screenH / 2) + 1
    const minor = []
    const major = []
    const y = 0.03

    for (let x = -hw; x <= hw; x++) {
      const arr = x % 5 === 0 ? major : minor
      arr.push(x, y, -hh,  x, y, hh)
    }
    for (let z = -hh; z <= hh; z++) {
      const arr = z % 5 === 0 ? major : minor
      arr.push(-hw, y, z,  hw, y, z)
    }

    const minorGeo = new THREE.BufferGeometry()
    minorGeo.setAttribute('position', new THREE.Float32BufferAttribute(minor, 3))
    const majorGeo = new THREE.BufferGeometry()
    majorGeo.setAttribute('position', new THREE.Float32BufferAttribute(major, 3))
    return { minorGeo, majorGeo }
  }, [screenW, screenH])

  return (
    <group>
      {showBorder && <Line points={borderPoints} color="#ffffff" lineWidth={2.5} depthWrite={false} />}
      {visible && (
        <>
          <lineSegments geometry={minorGeo}>
            <lineBasicMaterial color="#1a1a2e" transparent opacity={0.18} depthWrite={false} />
          </lineSegments>
          <lineSegments geometry={majorGeo}>
            <lineBasicMaterial color="#1a1a2e" transparent opacity={0.45} depthWrite={false} />
          </lineSegments>
        </>
      )}
    </group>
  )
}
