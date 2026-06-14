'use client'

import { useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { randomUUID } from '@/lib/uuid'

export interface AssetRecord {
  id: string
  storageKey: string
  filename: string
  mimeType: string
  widthPx: number | null
  heightPx: number | null
  url: string  // public storage URL
}

function getImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise(resolve => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload  = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(objectUrl) }
    img.onerror = () => { resolve(null); URL.revokeObjectURL(objectUrl) }
    img.src = objectUrl
  })
}

export function useAssets(tableId: string) {
  const supabase = useMemo(() => createClient(), [])
  const [assets, setAssets] = useState<AssetRecord[]>([])
  const [loading, setLoading] = useState(false)

  // Called once on mount from ControlScene; not an effect here so callers control timing.
  const fetchAssets = useCallback(async () => {
    const { data } = await supabase
      .from('asset')
      .select('id, storage_key, filename, mime_type, width_px, height_px')
      .eq('table_id', tableId)
      .order('created_at', { ascending: false })
    if (!data) return
    setAssets(data.map(a => ({
      id:         a.id,
      storageKey: a.storage_key,
      filename:   a.filename,
      mimeType:   a.mime_type,
      widthPx:    a.width_px,
      heightPx:   a.height_px,
      url:        supabase.storage.from('map-assets').getPublicUrl(a.storage_key).data.publicUrl,
    })))
  }, [tableId, supabase])

  const uploadAsset = useCallback(async (file: File): Promise<AssetRecord | null> => {
    setLoading(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
      const key = `${tableId}/${randomUUID()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('map-assets')
        .upload(key, file, { contentType: file.type })

      if (uploadError) { console.error('useAssets: upload', uploadError); return null }

      const dims = await getImageDimensions(file)

      const { data: row, error: insertError } = await supabase
        .from('asset')
        .insert({
          table_id:   tableId,
          storage_key: key,
          filename:   file.name,
          mime_type:  file.type,
          width_px:   dims?.width  ?? null,
          height_px:  dims?.height ?? null,
          file_size:  file.size,
        })
        .select('id, storage_key, filename, mime_type, width_px, height_px')
        .single()

      if (insertError || !row) { console.error('useAssets: insert', insertError); return null }

      const record: AssetRecord = {
        id:         row.id,
        storageKey: row.storage_key,
        filename:   row.filename,
        mimeType:   row.mime_type,
        widthPx:    row.width_px,
        heightPx:   row.height_px,
        url:        supabase.storage.from('map-assets').getPublicUrl(key).data.publicUrl,
      }
      setAssets(prev => [record, ...prev])
      return record
    } finally {
      setLoading(false)
    }
  }, [tableId, supabase])

  const deleteAsset = useCallback(async (assetId: string, storageKey: string) => {
    await supabase.storage.from('map-assets').remove([storageKey])
    await supabase.from('asset').delete().eq('id', assetId)
    setAssets(prev => prev.filter(a => a.id !== assetId))
  }, [supabase])

  return { assets, loading, fetchAssets, uploadAsset, deleteAsset }
}
