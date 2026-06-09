import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { source, event, data } = await req.json()
  const ts = new Date().toISOString().slice(11, 23) // HH:MM:SS.mmm
  const line = data != null ? `${event} ${JSON.stringify(data)}` : event
  console.log(`[${ts}] [${source}] ${line}`)
  return NextResponse.json({ ok: true })
}
