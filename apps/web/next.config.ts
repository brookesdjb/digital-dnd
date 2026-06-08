import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: [
    '@dnd-table/types',
    'three',
    '@react-three/fiber',
    '@react-three/drei',
    '@react-three/postprocessing',
    'leva',
  ],
}

export default nextConfig
