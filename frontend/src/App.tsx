import { useEffect, useMemo, useRef, useState } from 'react'
import { AppSidebar } from './components/AppSidebar'
import { ContextHeader } from './components/ContextHeader'
import { LoginScreen } from './screens/LoginScreen'
import { AnalysisPageV2 } from './screens/AnalysisPageV2'
import { ComposeScreen } from './screens/ComposeScreen'
import { EncodePage } from './screens/EncodePage'
import { RevealPageV2 } from './screens/RevealPageV2'
import { SettingsPageV2 } from './screens/SettingsPageV2'
import {
  createMessage,
  getAnalysis,
  getConversationHistory,
  getFiles,
  getMessages,
  getSession,
  getUsers,
  login as loginRequest,
  logout as logoutRequest,
  uploadWavFile,
} from './services/api'
import {
  connectSocket,
  disconnectSocket,
  offSocketEvent,
  onSocketEvent,
} from './services/socket'
import type {
  AnalysisPayload,
  AudioTransfer,
  ChatMessage,
  ConnectionState,
  ConversationItem,
  DecodeResult,
  Message,
  NavKey,
  ScreenFrame,
  SelectedAudio,
  User,
} from './types'

type AnalysisRunStatus = 'idle' | 'loading' | 'success' | 'partial' | 'failed'

const screenFrames: Record<Exclude<NavKey, 'chat'>, ScreenFrame> = {
  encode: {
    eyebrow: 'Aura V2-R',
    title: 'Encode',
    subtitle: 'Hide text inside an approved safe speech carrier.',
  },
  reveal: {
    eyebrow: 'Private recovery',
    title: 'Reveal',
    subtitle: 'Decode the length header, recover payload chunks, and inspect corrections.',
  },
  analysis: {
    eyebrow: 'Signal forensics',
    title: 'Analysis',
    subtitle: 'Inspect signal, payload, encode, decode, and recovery structure.',
  },
  settings: {
    eyebrow: 'Environment',
    title: 'Settings',
    subtitle: 'Control appearance, session behavior, and Aura demo policy.',
  },
}

function dedupeById<T extends { id: number | string }>(items: T[], nextItem: T) {
  return items.some((item) => item.id === nextItem.id) ? items : [...items, nextItem]
}

function isLikelyOptimisticMessageId(id: number | string): boolean {
  const numericId = Number(id)
  return Number.isFinite(numericId) && numericId >= 1_000_000_000_000
}

const EPOCH_ISO = '1970-01-01T00:00:00.000Z'

function parseBackendTimestamp(value: unknown): string | null {
  if (!value) return null

  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isFinite(time) ? new Date(time).toISOString() : null
  }

  const raw = String(value).trim()
  if (!raw) return null

  // SQLite CURRENT_TIMESTAMP format from backend: "YYYY-MM-DD HH:MM:SS" (UTC, no timezone).
  const sqliteMatch = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/,
  )
  if (sqliteMatch) {
    const [, year, month, day, hour, minute, second] = sqliteMatch
    const ms = Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    )
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null
  }

  // Epoch seconds or milliseconds.
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw)
    if (Number.isFinite(numeric)) {
      const ms = raw.length >= 13 ? numeric : numeric * 1000
      const time = new Date(ms).getTime()
      if (Number.isFinite(time)) return new Date(time).toISOString()
    }
  }

  // ISO or RFC-like formats with timezone info.
  const parsed = new Date(raw)
  const parsedTime = parsed.getTime()
  if (!Number.isFinite(parsedTime)) return null
  return parsed.toISOString()
}

function stableFallbackIsoFromId(id: unknown): string {
  const numericId = Number(id)
  if (!Number.isFinite(numericId) || numericId <= 0) return EPOCH_ISO

  const ms = numericId >= 1e12 ? numericId : numericId * 1000
  const time = new Date(ms).getTime()
  if (!Number.isFinite(time)) return EPOCH_ISO
  return new Date(time).toISOString()
}

function pickTimestamp(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const iso = parseBackendTimestamp(source[key])
    if (iso) return iso
  }
  return null
}

function safeTime(value: unknown): number {
  if (!value) return 0
  const time = new Date(String(value)).getTime()
  return Number.isFinite(time) ? time : 0
}

function getConversationItemTime(item: ConversationItem): number {
  if (item.type === 'message') return safeTime(item.message.createdAt)
  if (item.type === 'aura_message') return safeTime(item.message.createdAt)
  return safeTime(item.transfer.createdAt)
}

function normalizeMessage(message: Message): Message {
  const raw = message as unknown as Record<string, unknown>
  const createdAt =
    pickTimestamp(raw, ['createdAt', 'created_at', 'timestamp', 'sent_at']) ??
    stableFallbackIsoFromId(raw.id)

  return {
    ...message,
    createdAt,
  }
}

function reconcileIncomingMessage(current: Message[], incoming: Message): Message[] {
  if (current.some((message) => message.id === incoming.id)) return current

  const normalizedIncoming = normalizeMessage(incoming)
  const incomingTime = safeTime(normalizedIncoming.createdAt)
  const incomingContent = normalizedIncoming.content.trim()

  const withoutOptimisticTwin = current.filter((message) => {
    if (!isLikelyOptimisticMessageId(message.id)) return true
    if (message.sender !== normalizedIncoming.sender) return true
    if (message.receiver !== normalizedIncoming.receiver) return true
    if (message.content.trim() !== incomingContent) return true

    const timeDelta = Math.abs(safeTime(message.createdAt) - incomingTime)
    return timeDelta > 15_000
  })

  return [...withoutOptimisticTwin, normalizedIncoming]
}

function normalizeTransfer(
  transfer: AudioTransfer,
  fallbackSender = '',
  fallbackReceiver = '',
): AudioTransfer {
  const raw = transfer as unknown as Record<string, unknown>
  const createdAt =
    pickTimestamp(raw, ['createdAt', 'created_at', 'timestamp', 'sent_at', 'uploaded_at']) ??
    stableFallbackIsoFromId(raw.id ?? raw.messageId)

  return {
    ...transfer,
    sender: transfer.sender || fallbackSender,
    receiver: transfer.receiver || fallbackReceiver,
    createdAt,
    originalFilename:
      transfer.originalFilename ||
      ((transfer.metadata as { file_name?: string } | undefined)?.file_name) ||
      `${transfer.messageId || transfer.id}.wav`,
    fileSize: transfer.fileSize ?? 0,
  }
}

function inferAnalysisSourceType(audio: SelectedAudio | null): 'single' | 'grouped' {
  if (!audio) return 'single'
  if (audio.analysisSourceType) return audio.analysisSourceType

  const fileName = audio.selectedPartFilename || audio.fileName || ''
  const partMatch = fileName.match(/^tx_[^_]+_part_(\d+)_of_(\d+)\.wav$/i)

  if (partMatch) {
    const totalParts = Number(partMatch[2])
    return Number.isFinite(totalParts) && totalParts > 1 ? 'grouped' : 'single'
  }

  if (audio.mode === 'multi') return 'grouped'
  if ((audio.totalSegments ?? 0) > 1) return 'grouped'
  if ((audio.segments?.length ?? 0) > 1) return 'grouped'

  // IMPORTANT:
  // transmissionId alone should NOT force grouped unless we truly know it's multi-part.
  return 'single'
}

function getAnalysisRequestKey(audio: SelectedAudio | null): string {
  if (!audio) return ''

  const sourceType = inferAnalysisSourceType(audio)
  const fileName = audio.selectedPartFilename || audio.fileName || ''
  const normalizedTarget =
    sourceType === 'grouped'
      ? audio.transmissionId || fileName
      : audio.audioUrl || fileName || audio.messageId || ''

  return [
    sourceType,
    normalizedTarget,
    audio.selectedPartNumber ?? '',
    audio.messageId ?? '',
  ].join(':')
}

function isAbortLikeError(error: unknown): boolean {
  if (!error) return false
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof Error && error.name === 'AbortError') return true

  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const normalized = message.toLowerCase()

  return (
    normalized.includes('signal is aborted') ||
    normalized.includes('operation was aborted') ||
    normalized.includes('aborterror') ||
    normalized.includes('request aborted') ||
    normalized.includes('cancelled')
  )
}
function getAnalysisStatus(payload: AnalysisPayload): AnalysisRunStatus {
  const status = (payload.status || '').toLowerCase()

  if (status === 'partial') return 'partial'

  if (
    status === 'failed' ||
    status === 'timed_out' ||
    status === 'invalid_target' ||
    status === 'missing_source' ||
    status === 'not_found' ||
    status === 'cancelled'
  ) {
    return 'failed'
  }

  return 'success'
}

function App() {
  const [activeScreen, setActiveScreen] = useState<NavKey>('chat')
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark'
    return window.localStorage.getItem('aura-theme') === 'light' ? 'light' : 'dark'
  })
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [selectedRecipient, setSelectedRecipient] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [auraMessages, setAuraMessages] = useState<ChatMessage[]>([])
  const [transfers, setTransfers] = useState<AudioTransfer[]>([])
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('disconnected')
  const [selectedAudio, setSelectedAudio] = useState<SelectedAudio | null>(null)
  const [decodeResult, setDecodeResult] = useState<DecodeResult | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisPayload | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const [hasAttemptedAnalysis, setHasAttemptedAnalysis] = useState(false)
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisRunStatus>('idle')
  const [booting, setBooting] = useState(true)
  const [authError, setAuthError] = useState('')
  const [chatError, setChatError] = useState('')
  const analysisRequestSeqRef = useRef(0)
  const inFlightAnalysisKeyRef = useRef<string | null>(null)

  useEffect(() => {
    window.localStorage.setItem('aura-theme', theme)
  }, [theme])

  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      try {
        const session = await getSession()
        if (!cancelled && session.authenticated && session.user) {
          setCurrentUser(session.user)
        }
      } catch {
        if (!cancelled) setAuthError('Unable to reach the Aura backend.')
      } finally {
        if (!cancelled) setBooting(false)
      }
    }

    restoreSession()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!currentUser) {
      setUsers([])
      setMessages([])
      setAuraMessages([])
      setTransfers([])
      setSelectedRecipient('')
      disconnectSocket()
      setConnectionState('disconnected')
      return
    }

    let cancelled = false
    const currentUsername = currentUser.username

    async function bootstrapChat() {
      try {
        const [nextUsers, nextTransfers, nextAuraMessages] = await Promise.all([
          getUsers(),
          getFiles(),
          getMessages(),
        ])
        if (cancelled) return

        const normalizedFiles = nextTransfers.map((transfer) =>
          normalizeTransfer(transfer, currentUsername, ''),
        )

        setUsers(nextUsers)
        setTransfers(normalizedFiles)
        setAuraMessages(nextAuraMessages)
        setSelectedRecipient((current) => {
          if (current && nextUsers.some((user) => user.username === current)) return current
          return nextUsers[0]?.username ?? ''
        })
      } catch {
        if (!cancelled) setChatError('Unable to load chat participants or transfers.')
      }
    }

    bootstrapChat()
    setConnectionState('connecting')
    const socket = connectSocket()

    const handleConnect = () => setConnectionState('connected')
    const handleDisconnect = () => setConnectionState('disconnected')
    const handleMessage = (message: Message) => {
      setMessages((current) => reconcileIncomingMessage(current, normalizeMessage(message)))
    }
    const handleTransfer = (transfer: AudioTransfer) => {
      setTransfers((current) =>
        dedupeById(current, normalizeTransfer(transfer, transfer.sender || currentUsername, '')),
      )
    }
    const handleError = (payload: { error?: string }) => {
      setChatError(payload.error || 'Realtime channel error.')
    }

    onSocketEvent('connect', handleConnect)
    onSocketEvent('disconnect', handleDisconnect)
    onSocketEvent('new_message', handleMessage)
    onSocketEvent('file_received', handleTransfer)
    onSocketEvent('chat_error', handleError)

    socket.connect()

    return () => {
      cancelled = true
      offSocketEvent('connect', handleConnect)
      offSocketEvent('disconnect', handleDisconnect)
      offSocketEvent('new_message', handleMessage)
      offSocketEvent('file_received', handleTransfer)
      offSocketEvent('chat_error', handleError)
      disconnectSocket()
    }
  }, [currentUser])

  useEffect(() => {
    if (!currentUser || !selectedRecipient) {
      setMessages([])
      return
    }

    const currentUsername = currentUser.username
    let cancelled = false

    async function loadConversation() {
      try {
        const history = await getConversationHistory(selectedRecipient)
        if (!cancelled) {
          setMessages((current) => {
            const isActiveConversation = (message: Message) =>
              (message.sender === currentUsername && message.receiver === selectedRecipient) ||
              (message.sender === selectedRecipient && message.receiver === currentUsername)

            const relatedCurrent = current
              .filter(isActiveConversation)
              .map(normalizeMessage)

            const merged = history
              .map(normalizeMessage)
              .reduce(
                (items, message) => reconcileIncomingMessage(items, message),
                relatedCurrent,
              )
              .sort(
                (left, right) => safeTime(left.createdAt) - safeTime(right.createdAt),
              )

            const unrelated = current.filter((message) => !isActiveConversation(message))
            return [...unrelated, ...merged]
          })
        }
      } catch {
        if (!cancelled) setChatError('Unable to load conversation history.')
      }
    }

    loadConversation()

    return () => {
      cancelled = true
    }
  }, [currentUser, selectedRecipient])

  const conversationItems = useMemo<ConversationItem[]>(() => {
    if (!currentUser || !selectedRecipient) return []

    const relatedMessages = messages
      .map(normalizeMessage)
      .filter(
        (message) =>
          (message.sender === currentUser.username && message.receiver === selectedRecipient) ||
          (message.sender === selectedRecipient && message.receiver === currentUser.username),
      )
      .map((message) => ({
        type: 'message' as const,
        id: `message-${message.id}`,
        timestamp: message.createdAt,
        message,
      }))

    const relatedTransfers = transfers
      .map((transfer) =>
        normalizeTransfer(transfer, currentUser.username, selectedRecipient),
      )
      .filter(
        (transfer) =>
          (transfer.sender === currentUser.username && transfer.receiver === selectedRecipient) ||
          (transfer.sender === selectedRecipient && transfer.receiver === currentUser.username),
      )
      .map((transfer) => ({
        type: 'file' as const,
        id: `file-${transfer.id}`,
        timestamp: transfer.createdAt,
        transfer,
      }))

    const relatedAuraMessages = auraMessages
      .filter(
        (message) =>
          (message.sender === currentUser.username && message.receiver === selectedRecipient) ||
          (message.sender === selectedRecipient && message.receiver === currentUser.username),
      )
      .map((message) => ({
        type: 'aura_message' as const,
        id: `aura-${message.id}`,
        timestamp: message.createdAt,
        message,
      }))

    return [...relatedMessages, ...relatedTransfers, ...relatedAuraMessages].sort((left, right) => {
      const timeDelta = getConversationItemTime(left) - getConversationItemTime(right)
      if (timeDelta !== 0) return timeDelta
      return left.id.localeCompare(right.id)
    })
  }, [auraMessages, currentUser, messages, selectedRecipient, transfers])

  const availableAnalysisAudio = useMemo<SelectedAudio[]>(() => {
    if (!currentUser) return []

    const map = new Map<string, SelectedAudio>()

    transfers
      .map((transfer) =>
        normalizeTransfer(transfer, transfer.sender || currentUser.username, ''),
      )
      .forEach((transfer) => {
        const messageId = transfer.messageId ? String(transfer.messageId) : ''
        const audioUrl = transfer.audioUrl || (transfer.id ? `/api/files/${transfer.id}/download` : '')

        if (!messageId || !audioUrl) return

        // Do NOT re-inject selectedAudio if it's already an /api/outputs/ URL
        // Prefer durable /api/files/{id}/download items
        if (
          selectedAudio?.audioUrl?.startsWith('/api/outputs/') &&
          transfer.messageId === selectedAudio.messageId &&
          transfer.audioUrl === selectedAudio.audioUrl
        ) {
          return
        }

        const key = `${messageId}-${audioUrl}`

        map.set(key, {
          messageId,
          audioUrl,
          fileName: transfer.originalFilename || `${messageId}.wav`,
          source: transfer.source === 'aura' ? 'Chat' : 'Uploaded',
          metadata: transfer.metadata,
        })
      })

    if (selectedAudio?.messageId && selectedAudio?.audioUrl) {
      const key = `${selectedAudio.messageId}-${selectedAudio.audioUrl}`
      map.set(key, selectedAudio)
    }

    return Array.from(map.values())
  }, [currentUser, selectedAudio, transfers])

  useEffect(() => {
    console.info('[analysis-ui] state', {
      hasAttemptedAnalysis,
      isAnalyzing: analysisLoading,
      analysisStatus,
      hasResult: analysis != null,
      hasError: Boolean(analysisError),
    })
  }, [analysis, analysisError, analysisLoading, analysisStatus, hasAttemptedAnalysis])

  async function handleLogin(username: string, password: string) {
    setAuthError('')
    setChatError('')
    try {
      setCurrentUser(await loginRequest(username, password))
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Login failed. Check credentials.',
      )
    }
  }

  async function handleLogout() {
    try {
      await logoutRequest()
    } finally {
      setCurrentUser(null)
      setActiveScreen('chat')
    }
  }

  function handleSendMessage(content: string) {
    if (!currentUser || !selectedRecipient) return

    setChatError('')

    const optimisticMessage: Message = normalizeMessage({
      id: Date.now(),
      sender: currentUser.username,
      receiver: selectedRecipient,
      content,
      createdAt: new Date().toISOString(),
      kind: 'text',
    } as Message)

    setMessages((current) => dedupeById(current, optimisticMessage))

    connectSocket().emit('send_message', {
      receiver: selectedRecipient,
      content,
    })
  }

  async function handleUpload(file: File) {
    if (!currentUser || !selectedRecipient) return

    setChatError('')

    try {
      const transfer = await uploadWavFile(selectedRecipient, file)

      const normalized = normalizeTransfer(
        transfer,
        currentUser.username,
        selectedRecipient,
      )

      setTransfers((current) => dedupeById(current, normalized))
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'Upload failed for this WAV file.')
      throw error
    }
  }

  async function handleAuraSendToChat(
    payload: Omit<ChatMessage, 'id'>,
    selected: SelectedAudio,
  ) {
    if (!currentUser || !selectedRecipient) {
      setChatError('Choose a recipient before sending encoded audio.')
      return
    }

    const messagePayload = {
      ...payload,
      sender: currentUser.username,
      receiver: selectedRecipient,
      direction: 'outgoing' as const,
      createdAt: new Date().toISOString(),
    }

    const saved = await createMessage(messagePayload)
    setAuraMessages((current) => [...current, saved])
    setSelectedAudio({
      ...selected,
      messageId: saved.messageId || selected.messageId,
      source: 'Chat',
    })
    setActiveScreen('chat')
  }

 function resetAnalysisStateForNewTarget() {
  analysisRequestSeqRef.current += 1
  inFlightAnalysisKeyRef.current = null
  setAnalysis(null)
  setAnalysisError('')
  setAnalysisLoading(false)
  setAnalysisStatus('idle')
  setHasAttemptedAnalysis(false)
}

function handleSelectAudio(audio: SelectedAudio) {
  const previousKey = getAnalysisRequestKey(selectedAudio)
  const nextKey = getAnalysisRequestKey(audio)

  if (previousKey && previousKey !== nextKey) {
    resetAnalysisStateForNewTarget()
  }

  setSelectedAudio(audio)
  setDecodeResult(null)
}
  function handleReveal(audio: SelectedAudio) {
    handleSelectAudio(audio)
    setActiveScreen('reveal')
  }

async function runAnalysis(audio: SelectedAudio, options?: { force?: boolean }) {
  const requestKey = getAnalysisRequestKey(audio)
  if (!requestKey) return

  if (inFlightAnalysisKeyRef.current === requestKey && !options?.force) {
    console.info('[analysis-ui] duplicate request ignored', { requestKey })
    return
  }

  const seq = analysisRequestSeqRef.current + 1
  analysisRequestSeqRef.current = seq
  inFlightAnalysisKeyRef.current = requestKey

  const sourceType = inferAnalysisSourceType(audio)

  console.info('[analysis-ui] request start', {
    requestKey,
    seq,
    sourceType,
    target: audio.selectedPartFilename || audio.fileName || audio.messageId,
    force: Boolean(options?.force),
  })

  setHasAttemptedAnalysis(true)
  setAnalysisLoading(true)
  setAnalysisStatus('loading')
  setAnalysisError('')

  try {
    const payload = await getAnalysis(audio)
    const isCurrent = seq === analysisRequestSeqRef.current

    console.info('[analysis-ui] response received', {
      requestKey,
      seq,
      isCurrent,
      status: payload?.status,
      mode: payload?.mode,
      sourceType: payload?.sourceType,
      hasSummary: Boolean(payload?.summary),
      hasRecovery: Boolean(payload?.recovery),
      hasCharts: Boolean(payload?.charts),
      hasChunkTable: Array.isArray(payload?.chunkTable),
    })

    // Ignore stale responses only
    if (!isCurrent) {
      console.info('[analysis-ui] stale response ignored', { requestKey, seq })
      return
    }

    // IMPORTANT:
    // Even "minimal" payloads must still be committed.
    // AnalysisPageV2 already decides whether it's renderable.
    setAnalysis(payload)
    setAnalysisError('')
    setAnalysisStatus(getAnalysisStatus(payload))

    console.info('[analysis-ui] response committed', {
      requestKey,
      seq,
      finalStatus: getAnalysisStatus(payload),
    })
  } catch (error) {
    const isCurrent = seq === analysisRequestSeqRef.current
    const abortLike = isAbortLikeError(error)
    const message = error instanceof Error ? error.message : String(error)

    console.info('[analysis-ui] request error', {
      requestKey,
      seq,
      isCurrent,
      abort: abortLike,
      message,
    })

    if (!isCurrent) {
      console.info('[analysis-ui] stale error ignored', { requestKey, seq })
      return
    }

    // IMPORTANT:
    // Abort-like errors should NOT wipe a previously valid analysis.
    // They also should NOT show red failed state unless there is truly no result yet.
    if (abortLike) {
      setAnalysisLoading(false)

      // If we already had a valid analysis on screen, keep it.
      if (analysis) {
        setAnalysisError('')
        setAnalysisStatus(getAnalysisStatus(analysis))
        console.info('[analysis-ui] abort ignored, preserving existing analysis', {
          requestKey,
          seq,
        })
      } else {
        setAnalysisError('')
        setAnalysisStatus('idle')
        console.info('[analysis-ui] abort reset to neutral state', {
          requestKey,
          seq,
        })
      }

      return
    }

    setAnalysis(null)
    setAnalysisError(message || 'Unable to load analysis.')
    setAnalysisStatus('failed')
  } finally {
    if (seq === analysisRequestSeqRef.current) {
      setAnalysisLoading(false)
      if (inFlightAnalysisKeyRef.current === requestKey) {
        inFlightAnalysisKeyRef.current = null
      }
    }
  }
}

 async function handleAnalyze(audio: SelectedAudio, options?: { force?: boolean }) {
  const previousKey = getAnalysisRequestKey(selectedAudio)
  const nextKey = getAnalysisRequestKey(audio)

  if (!previousKey || previousKey !== nextKey) {
    resetAnalysisStateForNewTarget()
  }

  setSelectedAudio(audio)
  setDecodeResult(null)
  setActiveScreen('analysis')

  // Only explicit Run Analysis should hit backend
  if (options?.force) {
    await runAnalysis(audio, { force: true })
  }
}

  function handleDecoded(result: DecodeResult) {
    setDecodeResult(result)
  }

  const hideContextHeader =
    activeScreen === 'encode' || activeScreen === 'reveal'

  if (booting) {
    return (
      <div className={`flex min-h-screen items-center justify-center bg-aura-bg px-6 text-aura-muted ${theme === 'light' ? 'theme-light' : ''}`}>
        Restoring Aura session...
      </div>
    )
  }

  if (!currentUser) {
    return (
      <div className={theme === 'light' ? 'theme-light' : ''}>
        <LoginScreen onLogin={handleLogin} error={authError} />
      </div>
    )
  }

  return (
    <div
      className={`relative h-screen min-h-0 overflow-hidden bg-aura-bg text-aura-text ${
        theme === 'light' ? 'theme-light' : ''
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-noise opacity-55" />
      <div className="pointer-events-none absolute -left-40 top-0 h-[340px] w-[340px] rounded-full bg-[radial-gradient(circle,rgba(93,87,255,0.08),transparent_68%)] blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-24 h-[280px] w-[280px] rounded-full bg-[radial-gradient(circle,rgba(114,209,199,0.035),transparent_68%)] blur-3xl" />

      <div className="relative flex h-full min-h-0">
        <AppSidebar active={activeScreen} onSelect={setActiveScreen} />

        <main
          className={
            activeScreen === 'chat'
              ? 'h-full min-h-0 min-w-0 flex-1 overflow-hidden'
              : 'h-screen min-w-0 flex-1 overflow-y-auto px-4 py-3 lg:px-6 lg:py-4'
          }
        >
          {activeScreen === 'chat' ? (
            <ComposeScreen
              currentUser={currentUser}
              users={users}
              selectedRecipient={selectedRecipient}
              onSelectRecipient={setSelectedRecipient}
              conversationItems={conversationItems}
              connectionState={connectionState}
              onSendMessage={handleSendMessage}
              onUploadFile={handleUpload}
              onRevealAudio={handleReveal}
              onAnalyzeAudio={handleAnalyze}
              error={chatError}
            />
          ) : (
            <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
              {!hideContextHeader && (
                <ContextHeader
                  title={screenFrames[activeScreen].title}
                  subtitle={screenFrames[activeScreen].subtitle}
                />
              )}

              {activeScreen === 'encode' ? (
                <EncodePage
                  onSendToChat={handleAuraSendToChat}
                  onSelectAudio={handleSelectAudio}
                  currentUser={currentUser}
                  selectedRecipient={selectedRecipient}
                />
              ) : null}

              {activeScreen === 'reveal' ? (
                <RevealPageV2
                  selectedAudio={selectedAudio}
                  decodeResult={decodeResult}
                  onDecoded={handleDecoded}
                />
              ) : null}

              {activeScreen === 'analysis' ? (
                <AnalysisPageV2
                  analysis={analysis}
                  selectedAudio={selectedAudio}
                  availableAudio={availableAnalysisAudio}
                  onAnalyzeAudio={handleAnalyze}
                  loading={analysisLoading}
                  error={analysisError}
                  hasAttempted={hasAttemptedAnalysis}
                  status={analysisStatus}
                />
              ) : null}

              {activeScreen === 'settings' ? (
                <SettingsPageV2
                  theme={theme}
                  onThemeChange={setTheme}
                  currentUser={currentUser.username}
                  onLogout={handleLogout}
                />
              ) : null}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App