import { useCallback, useEffect, useRef, useState } from 'react'

export interface GmailConnectionState {
  connected: boolean
  detail?: string
}

/**
 * Shared Gmail connect flow (feat/gmail-read): status check, "Connect Gmail"
 * (main opens the Composio auth link in the browser), and status polling up
 * to 2 minutes. Used by both the Settings Connections panel and the palette
 * results-panel Connect card so the logic lives in exactly one place.
 */
export function useGmailConnect(): {
  status: GmailConnectionState | null
  connecting: boolean
  message: string | null
  refresh: () => Promise<GmailConnectionState | null>
  connect: () => Promise<void>
} {
  const [status, setStatus] = useState<GmailConnectionState | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const refresh = useCallback(async (): Promise<GmailConnectionState | null> => {
    try {
      const res = (await window.palette.connectionStatus('gmail')) as {
        ok: boolean
        connected?: boolean
        detail?: string
      }
      if (!res.ok) return null
      const st = { connected: res.connected ?? false, detail: res.detail }
      setStatus(st)
      return st
    } catch {
      return null
    }
  }, [])

  const connect = useCallback(async (): Promise<void> => {
    stopPolling()
    setMessage(null)
    const res = (await window.palette.connectionConnect('gmail')) as {
      ok: boolean
      url?: string
      error?: string
    }
    if (!res.ok) {
      setMessage(res.error ?? 'Could not start Gmail connection.')
      return
    }
    const st = await refresh()
    if (st?.connected) {
      setMessage('Gmail is connected.')
      return
    }
    setConnecting(true)
    setMessage('Browser opened — approve Gmail access there. Waiting up to 2 minutes…')
    const deadline = Date.now() + 120_000
    pollRef.current = setInterval(() => {
      void (async () => {
        const cur = await refresh()
        if (cur?.connected) {
          stopPolling()
          setConnecting(false)
          setMessage('Gmail connected. Ask your question again.')
        } else if (Date.now() > deadline) {
          stopPolling()
          setConnecting(false)
          setMessage('Timed out waiting (2 min). Press Connect Gmail to try again.')
        }
      })()
    }, 3000)
  }, [refresh, stopPolling])

  useEffect(() => {
    void refresh()
    return () => stopPolling()
  }, [refresh, stopPolling])

  return { status, connecting, message, refresh, connect }
}
