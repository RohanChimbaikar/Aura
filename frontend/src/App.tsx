import { useEffect, useMemo, useRef, useState } from 'react'
import { AppSidebar } from './components/AppSidebar'
import { ContextHeader } from './components/ContextHeader'
import { LoginScreen } from './screens/LoginScreen'
import { AnalysisPageV2 } from './screens/AnalysisPageV2'
import { ComposeScreen } from './screens/ComposeScreen'
import { EncodePage } from './screens/EncodePage'
import { RevealPageV2 } from './screens/RevealPageV2'
import { SettingsPageV2 } from './screens/SettingsPageV2'
import CompareScreen from './screens/CompareScreen'
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
  registerUser,
  loginGoogle,
  forgotPassword,
  resetPassword,
  resolveUrl,
} from './services/api'
import { SignUpScreen } from './screens/SignUpScreen'
import { ForgotPasswordScreen } from './screens/ForgotPasswordScreen'
import { ResetPasswordScreen } from './screens/ResetPasswordScreen'
import { ConversationSidebar } from './screens/ConversationSidebar'
import { UserProfileModal } from './components/UserProfileModal'
import { ChangePasswordModal } from './components/ChangePasswordModal'
import { cn } from './lib/utils'
import {
  exportAuraPackage,
  importAuraPackage,
  attemptMetadataRecovery,
} from './lib/transmission'
import { TransmissionDetailsModal } from './components/TransmissionDetailsModal'
import { RecipientModal } from './components/RecipientModal'
import { AnimatePresence, motion } from 'framer-motion'
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
  compare: {
  eyebrow: 'Comparative forensics',
  title: 'Compare',
  subtitle:
    'Compare multiple Aura analysis runs side-by-side.',
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
  transfer: AudioTransfer | Record<string, unknown>,
  fallbackSender = '',
  fallbackReceiver = '',
): AudioTransfer {
  const raw = transfer as Record<string, unknown>
  const createdAt =
    pickTimestamp(raw, ['createdAt', 'created_at']) ?? new Date().toISOString()

  const t = transfer as AudioTransfer
  return {
    ...t,
    sender: String(t.sender || fallbackSender),
    receiver: String(t.receiver || fallbackReceiver),
    audioUrl: t.audioUrl || (raw.audio_url as string | undefined) || '',
    originalFilename:
      t.originalFilename ||
      (raw.original_filename as string | undefined) ||
      (raw.file_name as string | undefined) ||
      `${String(t.messageId ?? raw.message_id ?? t.id)}.wav`,
    createdAt,
    fileSize: Number(t.fileSize ?? raw.file_size ?? 0),
    messageId: t.messageId ?? (raw.message_id as string | undefined),
    metadata: t.metadata ?? (raw.metadata as AudioTransfer['metadata']) ?? {},
  }
}

function isTransferForConversation(
  transfer: AudioTransfer,
  currentUsername: string,
  selectedRecipient: string,
): boolean {
  if (!selectedRecipient) return false
  return (
    (transfer.sender === currentUsername && transfer.receiver === selectedRecipient) ||
    (transfer.sender === selectedRecipient && transfer.receiver === currentUsername)
  )
}

function isAuraMessageForConversation(
  message: ChatMessage,
  currentUsername: string,
  selectedRecipient: string,
): boolean {
  if (!selectedRecipient) return false
  return (
    (message.sender === currentUsername && message.receiver === selectedRecipient) ||
    (message.sender === selectedRecipient && message.receiver === currentUsername)
  )
}

function normalizeAuraChatMessage(raw: Record<string, unknown>): ChatMessage {
  const createdAt =
    pickTimestamp(raw, ['createdAt', 'created_at']) ?? new Date().toISOString()
  const base = { ...raw } as Record<string, unknown>
  const segmentsUnknown = base.segments
  const segments = Array.isArray(segmentsUnknown)
    ? (segmentsUnknown as Record<string, unknown>[]).map((seg) => ({
        segmentIndex: Number(seg.segmentIndex ?? seg.segment_index ?? 0),
        totalSegments: seg.totalSegments ?? seg.total_segments,
        audioUrl: String(seg.audioUrl ?? seg.audio_url ?? ''),
        fileName: String(seg.fileName ?? seg.stego_file_name ?? ''),
        carrierName: seg.carrierName ?? seg.carrier_name,
        carrierDurationSec: seg.carrierDurationSec ?? seg.carrier_duration_sec,
      }))
    : undefined

  const direction: ChatMessage['direction'] =
    base.direction === 'incoming' ? 'incoming' : 'outgoing'
  const typeRaw = base.type
  const type: ChatMessage['type'] =
    typeRaw === 'audio_group' ? 'audio_group' : typeRaw === 'text' ? 'text' : 'audio'

  return {
    ...(raw as unknown as ChatMessage),
    id: String(base.id ?? ''),
    createdAt,
    sender: String(base.sender ?? ''),
    receiver: String(base.receiver ?? ''),
    direction,
    type,
    text: base.text != null ? String(base.text) : undefined,
    audioUrl: (base.audioUrl ?? base.audio_url) as string | undefined,
    messageId:
      base.messageId != null
        ? String(base.messageId)
        : base.message_id != null
          ? String(base.message_id)
          : undefined,
    transmissionId: (base.transmissionId ?? base.transmission_id) as string | undefined,
    mode: base.mode as ChatMessage['mode'],
    totalSegments: (base.totalSegments ?? base.total_segments) as number | undefined,
    segments: segments as ChatMessage['segments'],
    manifest: base.manifest as ChatMessage['manifest'],
    metadata: (base.metadata ?? {}) as ChatMessage['metadata'],
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
  const [liveConversation, setLiveConversation] = useState<ConversationItem[]>([])
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
  const [authPage, setAuthPage] = useState<'login' | 'signup' | 'forgot-password' | 'reset-password'>('login')
  const [resetToken, setResetToken] = useState('')
  const [chatError, setChatError] = useState('')
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  const [profileOpen, setProfileOpen] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [importedAudios, setImportedAudios] = useState<SelectedAudio[]>([])
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [detailsAudio, setDetailsAudio] = useState<SelectedAudio | null>(null)
  const [showForwardModal, setShowForwardModal] = useState(false)
  const [forwardingAudio, setForwardingAudio] = useState<SelectedAudio | null>(null)

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type })
    setTimeout(() => {
      setToast(null)
    }, 4000)
  }

  const analysisRequestSeqRef = useRef(0)
  const inFlightAnalysisKeyRef = useRef<string | null>(null)

  useEffect(() => {
    window.localStorage.setItem('aura-theme', theme)
  }, [theme])

  useEffect(() => {
    let cancelled = false

    // Parse query params on mount for password reset token
    const queryParams = new URLSearchParams(window.location.search)
    const token = queryParams.get('token')
    if (token) {
      setResetToken(token)
      setAuthPage('reset-password')
      // Clear token from URL bar for aesthetics
      window.history.replaceState({}, document.title, window.location.pathname)
    }

    async function restoreSession() {
      try {
        const session = await getSession()
        if (session.authenticated && session.user && !cancelled) {
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
      setLiveConversation([])
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
          return '' // Default to empty state dashboard
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
      if (!currentUser) return

      const normalized = normalizeTransfer(
        transfer,
        String(transfer.sender || ''),
        String(transfer.receiver || ''),
      )

      setTransfers((prev) => {
        if (prev.some((t) => t.id === normalized.id)) return prev
        return [...prev, normalized]
      })

      setLiveConversation((prev) => {
        if (prev.some((item) => item.id === `file-${normalized.id}`)) return prev

        return [
          ...prev,
          {
            type: 'file' as const,
            id: `file-${normalized.id}`,
            timestamp: normalized.createdAt,
            transfer: normalized,
          },
        ]
      })
    }

    const handleAuraChatMessage = (raw: unknown) => {
      if (!currentUser || !raw || typeof raw !== 'object') return
      const message = normalizeAuraChatMessage(raw as Record<string, unknown>)
      if (!message.id) return

      setAuraMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev

        const mid = message.messageId
        if (mid) {
          const optimisticIdx = prev.findIndex(
            (m) =>
              String(m.id).startsWith('temp-') &&
              m.sender === message.sender &&
              m.receiver === message.receiver &&
              m.messageId === mid,
          )
          if (optimisticIdx !== -1) {
            const next = [...prev]
            next[optimisticIdx] = message
            return next
          }
        }

        return [...prev, message]
      })

      setLiveConversation((prev) => {
        const rowId = `aura-${message.id}`
        if (prev.some((item) => item.id === rowId)) return prev
        return [
          ...prev,
          {
            type: 'aura_message' as const,
            id: rowId,
            timestamp: message.createdAt,
            message,
          },
        ]
      })
    }

    const handlePresence = (payload: { username: string; status: 'online' | 'offline' }) => {
      setOnlineUsers((current) => {
        const next = new Set(current)
        if (payload.status === 'online') {
          next.add(payload.username)
        } else {
          next.delete(payload.username)
        }
        return next
      })
    }

    const handleOnlineUsers = (list: string[]) => {
      setOnlineUsers(new Set(list))
    }

    const handleError = (payload: { error?: string }) => {
      setChatError(payload.error || 'Realtime channel error.')
    }

    onSocketEvent('connect', handleConnect)
    onSocketEvent('disconnect', handleDisconnect)
    onSocketEvent('new_message', handleMessage)
    onSocketEvent('file_received', handleTransfer)
    onSocketEvent('aura_chat_message', handleAuraChatMessage)
    onSocketEvent('presence', handlePresence)
    onSocketEvent('online_users', handleOnlineUsers)
    onSocketEvent('chat_error', handleError)

    socket.connect()

    return () => {
      cancelled = true
      offSocketEvent('connect', handleConnect)
      offSocketEvent('disconnect', handleDisconnect)
      offSocketEvent('new_message', handleMessage)
      offSocketEvent('file_received', handleTransfer)
      offSocketEvent('aura_chat_message', handleAuraChatMessage)
      offSocketEvent('presence', handlePresence)
      offSocketEvent('online_users', handleOnlineUsers)
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

  useEffect(() => {
    setLiveConversation([])
  }, [selectedRecipient])

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
      .filter((transfer) =>
        isTransferForConversation(transfer, currentUser.username, selectedRecipient),
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

  const liveForSelectedChat = useMemo(() => {
    if (!currentUser || !selectedRecipient) return []
    const me = currentUser.username
    const other = selectedRecipient
    return liveConversation.filter((item) => {
      if (item.type === 'file') {
        return isTransferForConversation(item.transfer, me, other)
      }
      if (item.type === 'aura_message') {
        return isAuraMessageForConversation(item.message, me, other)
      }
      return false
    })
  }, [currentUser, liveConversation, selectedRecipient])
  const mergedConversationItems = useMemo(() => {
    if (!liveForSelectedChat.length) return conversationItems
    const byId = new Map<string, ConversationItem>()
    for (const item of conversationItems) {
      byId.set(item.id, item)
    }
    for (const item of liveForSelectedChat) {
      byId.set(item.id, item)
    }
    return Array.from(byId.values()).sort((left, right) => {
      const timeDelta = getConversationItemTime(left) - getConversationItemTime(right)
      if (timeDelta !== 0) return timeDelta
      return left.id.localeCompare(right.id)
    })
  }, [conversationItems, liveForSelectedChat])

  const handleAuraDownloadPackage = async (audio: SelectedAudio) => {
    try {
      showToast('Preparing transmission package...', 'info')
      const audioUrl = resolveUrl(audio.audioUrl)
      const fileName = audio.fileName || 'transmission.wav'
      
      const metadata = (audio.metadata || {}) as any
      await exportAuraPackage(audioUrl, fileName, {
        transmissionId: audio.transmissionId || undefined,
        sender: metadata.sender || currentUser?.username,
        recipient: metadata.recipient || selectedRecipient,
        createdAt: metadata.created_at,
        carrier: metadata.carrier || audio.metadata?.carrier_alias,
        parts: audio.totalSegments || metadata.parts || (audio.segments?.length ?? 1),
        mode: audio.mode || audio.metadata?.mode || metadata.mode || 'single',
        reuse: metadata.reuse ?? false,
        duration: audio.metadata?.carrier_duration_sec || metadata.duration,
        analysis: metadata.analysis,
      })
      showToast('✓ Transmission exported successfully.', 'success')
    } catch (err) {
      console.error(err)
      showToast('Export failed.', 'error')
    }
  }



  const handleAuraShowDetails = (audio: SelectedAudio) => {
    setDetailsAudio(audio)
    setShowDetailsModal(true)
  }

  const handleAuraForward = (audio: SelectedAudio) => {
    setForwardingAudio(audio)
    setShowForwardModal(true)
  }

  const handleForwardConfirm = async (recipientUsername: string) => {
    setShowForwardModal(false)
    if (!forwardingAudio || !currentUser) return
    
    try {
      showToast('Forwarding transmission...', 'info')
      
      const isMulti = forwardingAudio.mode === 'multi' || (forwardingAudio.segments?.length ?? 0) > 1
      const payload: Omit<ChatMessage, 'id'> = {
        type: isMulti ? 'audio_group' : 'audio',
        direction: 'outgoing',
        sender: currentUser.username,
        receiver: recipientUsername,
        createdAt: new Date().toISOString(),
        audioUrl: forwardingAudio.audioUrl,
        messageId: forwardingAudio.messageId,
        transmissionId: forwardingAudio.transmissionId,
        mode: forwardingAudio.mode,
        totalSegments: forwardingAudio.totalSegments,
        segments: forwardingAudio.segments,
        manifest: forwardingAudio.metadata?.manifest,
        metadata: forwardingAudio.metadata,
      }

      const saved = await createMessage(payload)
      
      if (recipientUsername === selectedRecipient) {
        setAuraMessages((prev) => [...prev, saved])
        setLiveConversation((prev) => [
          ...prev,
          {
            type: 'aura_message',
            id: `aura-${saved.id}`,
            timestamp: saved.createdAt,
            message: saved
          }
        ])
      }

      showToast('✓ Transmission forwarded successfully.', 'success')
    } catch (err) {
      console.error(err)
      showToast('Forwarding failed.', 'error')
    } finally {
      setForwardingAudio(null)
    }
  }

  const handleAuraDeleteMessage = (messageId: string) => {
    setAuraMessages((prev) => prev.filter((m) => String(m.id) !== String(messageId) && String(m.messageId) !== String(messageId)))
    setTransfers((prev) => prev.filter((t) => String(t.id) !== String(messageId) && String(t.messageId) !== String(messageId)))
    setMessages((prev) => prev.filter((m) => String(m.id) !== String(messageId)))
    
    setLiveConversation((prev) => prev.filter((item) => {
      if (item.type === 'aura_message') {
        return String(item.message.id) !== String(messageId) && String(item.message.messageId) !== String(messageId)
      }
      if (item.type === 'file') {
        return String(item.transfer.id) !== String(messageId) && String(item.transfer.messageId) !== String(messageId)
      }
      return true
    }))

    showToast('✓ Message removed from view.', 'success')
  }

  const handleImportFileForAnalysis = async (file: File) => {
    try {
      if (file.name.endsWith('.aura')) {
        showToast('Processing Aura package...', 'info')
        const { audioBlob, metadata } = await importAuraPackage(file)
        
        const audioFile = new File([audioBlob], metadata.file_name || file.name.replace(/\.aura$/i, '.wav'), {
          type: 'audio/wav',
        })
        
        showToast('Restoring transmission resources...', 'info')
        const transfer = await uploadWavFile(currentUser?.username || 'self', audioFile)
        
        const importedAudio: SelectedAudio = {
          messageId: String(transfer.id),
          audioUrl: transfer.audioUrl,
          fileName: transfer.originalFilename,
          source: 'Uploaded',
          metadata: metadata,
          transmissionId: metadata.transmission_id || undefined,
          totalSegments: metadata.parts || 1,
          mode: metadata.mode || 'single',
          analysisSourceType: metadata.mode === 'multi' || (metadata.parts ?? 1) > 1 ? 'grouped' : 'single',
        }
        
        setImportedAudios((prev) => [importedAudio, ...prev])
        showToast('✓ Transmission imported successfully.', 'success')
        await handleAnalyze(importedAudio, { force: true })
      } else {
        showToast('Uploading audio file...', 'info')
        const transfer = await uploadWavFile(currentUser?.username || 'self', file)
        
        const allAvailable = [
          ...importedAudios,
          ...auraMessages.map((m) => ({
            messageId: m.messageId || m.id,
            audioUrl: m.audioUrl || '',
            fileName: m.metadata?.file_name || `${m.messageId || m.id}.wav`,
            source: 'Chat' as const,
            metadata: m.metadata,
            transmissionId: m.transmissionId,
            totalSegments: m.totalSegments,
            segments: m.segments,
          })),
          ...transfers.map((t) => ({
            messageId: String(t.id),
            audioUrl: t.audioUrl || '',
            fileName: t.originalFilename,
            source: 'Chat' as const,
            metadata: t.metadata,
            transmissionId: t.metadata?.transmission_id,
          })),
        ]
        
        const recoveredMetadata = attemptMetadataRecovery(file.name, allAvailable)
        
        if (!recoveredMetadata) {
          showToast('This transmission contains limited metadata. Some analysis features may be unavailable.', 'info')
        } else {
          showToast('✓ Metadata successfully recovered.', 'success')
        }
        
        const importedAudio: SelectedAudio = {
          messageId: String(transfer.id),
          audioUrl: transfer.audioUrl,
          fileName: transfer.originalFilename,
          source: 'Uploaded',
          metadata: recoveredMetadata || undefined,
          transmissionId: recoveredMetadata?.transmission_id || undefined,
          totalSegments: recoveredMetadata?.total_segments || 1,
          mode: recoveredMetadata?.mode || 'single',
          analysisSourceType: recoveredMetadata?.mode === 'multi' ? 'grouped' : 'single',
        }
        
        setImportedAudios((prev) => [importedAudio, ...prev])
        showToast('✓ Audio file imported successfully.', 'success')
        await handleAnalyze(importedAudio, { force: true })
      }
    } catch (err) {
      console.error('Import failed:', err)
      showToast(err instanceof Error ? err.message : 'Import failed.', 'error')
    }
  }

  const availableAnalysisAudio = useMemo<SelectedAudio[]>(() => {
    if (!currentUser) return []

    const map = new Map<string, SelectedAudio>()

    importedAudios.forEach((audio) => {
      const key = `${audio.messageId}-${audio.audioUrl}`
      map.set(key, audio)
    })

    transfers
      .map((transfer) =>
        normalizeTransfer(transfer, transfer.sender || currentUser.username, ''),
      )
      .forEach((transfer) => {
        const messageId = transfer.messageId ? String(transfer.messageId) : ''
        const audioUrl = transfer.audioUrl || (transfer.id ? `/api/files/${transfer.id}/download` : '')

        if (!messageId || !audioUrl) return

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
  }, [currentUser, selectedAudio, transfers, importedAudios])

  const recentUsers = useMemo<string[]>(() => {
    if (!currentUser) return []
    const currentUsername = currentUser.username
    const contacts = new Map<string, number>()

    const updateContact = (username: string | undefined, timeStr: string) => {
      if (!username || username === currentUsername) return
      const time = new Date(timeStr).getTime()
      if (Number.isFinite(time)) {
        const existing = contacts.get(username) || 0
        if (time > existing) {
          contacts.set(username, time)
        }
      }
    }

    for (const msg of messages) {
      updateContact(msg.sender, msg.createdAt)
      updateContact(msg.receiver, msg.createdAt)
    }

    for (const msg of auraMessages) {
      updateContact(msg.sender, msg.createdAt)
      updateContact(msg.receiver, msg.createdAt)
    }

    for (const tr of transfers) {
      updateContact(tr.sender, tr.createdAt)
      updateContact(tr.receiver, tr.createdAt)
    }

    return Array.from(contacts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([username]) => username)
  }, [currentUser, messages, auraMessages, transfers])

  useEffect(() => {
    console.info('[analysis-ui] state', {
      hasAttemptedAnalysis,
      isAnalyzing: analysisLoading,
      analysisStatus,
      hasResult: analysis != null,
      hasError: Boolean(analysisError),
    })
  }, [analysis, analysisError, analysisLoading, analysisStatus, hasAttemptedAnalysis])

  async function handleLogin(usernameOrEmail: string, password: string, rememberMe: boolean) {
    setAuthError('')
    setChatError('')
    try {
      setCurrentUser(await loginRequest(usernameOrEmail, password, rememberMe))
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Login failed. Check credentials.',
      )
    }
  }

  async function handleGoogleLogin(credential: string) {
    setAuthError('')
    setChatError('')
    try {
      setCurrentUser(await loginGoogle(credential))
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Google sign-in failed.',
      )
    }
  }

  async function handleRegister(payload: Record<string, string>) {
    setAuthError('')
    try {
      setCurrentUser(await registerUser(payload))
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Registration failed.',
      )
      throw error
    }
  }

  async function handleForgotPassword(email: string) {
    setAuthError('')
    try {
      await forgotPassword(email)
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Failed to request reset link.',
      )
      throw error
    }
  }

  async function handleResetPassword(password: string) {
    setAuthError('')
    try {
      await resetPassword({ token: resetToken, password })
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Failed to reset password.',
      )
      throw error
    }
  }

  async function handleLogout() {
    try {
      await logoutRequest()
    } finally {
      setCurrentUser(null)
      setActiveScreen('chat')
      setAuthPage('login')
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

  // 1. Create optimistic transfer
  const tempId = `temp-${Date.now()}`

  const optimisticTransfer: AudioTransfer = normalizeTransfer(
    {
      id: tempId,
      messageId: tempId,
      sender: currentUser.username,
      receiver: selectedRecipient,
      audioUrl: URL.createObjectURL(file),
      originalFilename: file.name,
      fileSize: file.size,
      createdAt: new Date().toISOString(),
      metadata: { file_name: file.name },
    } as AudioTransfer,
    currentUser.username,
    selectedRecipient
  )

  // 2. Show instantly in chat
  setTransfers((current) => [...current, optimisticTransfer])

  try {
    const transfer = await uploadWavFile(selectedRecipient, file)

    const normalized = normalizeTransfer(
      transfer,
      currentUser.username,
      selectedRecipient
    )

    // 3. Replace optimistic with real
    setTransfers((current) =>
      current.map((t) =>
        t.id === tempId ? normalized : t
      )
    )
  } catch (error) {
    // 4. Remove failed optimistic entry
    setTransfers((current) =>
      current.filter((t) => t.id !== tempId)
    )

    setChatError(
      error instanceof Error ? error.message : 'Upload failed for this WAV file.'
    )
    throw error
  }
}
  async function handleAuraSendToChat(
    payload: Omit<ChatMessage, 'id'>,
    selected: SelectedAudio,
    recipientOverride?: string,
  ) {
    const recipient = recipientOverride || selectedRecipient
    if (!currentUser || !recipient) {
      setChatError('Choose a recipient before sending encoded audio.')
      return
    }

    const tempId = `temp-${Date.now()}`

    const optimisticMessage: ChatMessage = {
      ...payload,
      id: tempId,
      sender: currentUser.username,
      receiver: recipient,
      direction: 'outgoing',
      createdAt: new Date().toISOString(),
    }

    // 1. Show immediately
    setAuraMessages((current) => [...current, optimisticMessage])

    try {
      const saved = await createMessage({
        ...payload,
        sender: currentUser.username,
        receiver: recipient,
        direction: 'outgoing',
        createdAt: new Date().toISOString(),
      })

      // 2. Replace optimistic with real
      setAuraMessages((current) =>
        current.map((msg) =>
          msg.id === tempId ? saved : msg
        )
      )

      setSelectedAudio({
        ...selected,
        messageId: saved.messageId || selected.messageId,
        source: 'Chat',
      })

      setSelectedRecipient(recipient)
      setActiveScreen('chat')
    } catch (error) {
      // 3. Remove if failed
      setAuraMessages((current) =>
        current.filter((msg) => msg.id !== tempId)
      )

      setChatError('Failed to send encoded audio.')
    }
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

function handleCompareSelectAudio(audio: SelectedAudio) {
  handleSelectAudio(audio)
  runAnalysis(audio)
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
    activeScreen === 'encode' || activeScreen === 'reveal' || activeScreen === 'analysis'

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
        {authPage === 'login' && (
          <LoginScreen
            onLogin={handleLogin}
            onGoogleLogin={handleGoogleLogin}
            onSignUpClick={() => {
              setAuthError('')
              setAuthPage('signup')
            }}
            onForgotPasswordClick={() => {
              setAuthError('')
              setAuthPage('forgot-password')
            }}
            error={authError}
            theme={theme}
          />
        )}
        {authPage === 'signup' && (
          <SignUpScreen
            onRegister={handleRegister}
            onGoogleLogin={handleGoogleLogin}
            onBackToLogin={() => {
              setAuthError('')
              setAuthPage('login')
            }}
            error={authError}
            theme={theme}
          />
        )}
        {authPage === 'forgot-password' && (
          <ForgotPasswordScreen
            onSubmit={handleForgotPassword}
            onBackToLogin={() => {
              setAuthError('')
              setAuthPage('login')
            }}
            error={authError}
          />
        )}
        {authPage === 'reset-password' && (
          <ResetPasswordScreen
            onSubmit={handleResetPassword}
            onBackToLogin={() => {
              setAuthError('')
              setAuthPage('login')
            }}
            error={authError}
          />
        )}
      </div>
    )
  }

  return (
    <div
      className={`relative h-screen min-h-0 overflow-hidden bg-aura-bg text-aura-text ${
        theme === 'light' ? 'theme-light' : ''
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-noise opacity-60" />

      <div className="relative flex h-full min-h-0">
        <AppSidebar active={activeScreen} onSelect={setActiveScreen}  theme={theme}/>

        {activeScreen === 'chat' && (
          <ConversationSidebar
            currentUser={currentUser}
            users={users}
            selectedRecipient={selectedRecipient}
            onSelectRecipient={setSelectedRecipient}
            onlineUsers={onlineUsers}
            onShowProfile={() => setProfileOpen(true)}
            onShowChangePassword={() => setChangePasswordOpen(true)}
            onSettingsClick={() => setActiveScreen('settings')}
            onLogout={handleLogout}
            theme={theme}
          />
        )}

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
              conversationItems={mergedConversationItems}
              connectionState={connectionState}
              onSendMessage={handleSendMessage}
              onUploadFile={handleUpload}
              onRevealAudio={handleReveal}
              onAnalyzeAudio={handleAnalyze}
              onDownloadPackage={handleAuraDownloadPackage}
              onForward={handleAuraForward}
              onShowDetails={handleAuraShowDetails}
              onDeleteMessage={handleAuraDeleteMessage}
              error={chatError}
              onlineUsers={onlineUsers}
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
                  users={users}
                  onlineUsers={onlineUsers}
                  recentUsers={recentUsers}
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
                  onImportAudio={handleImportFileForAnalysis}
                  loading={analysisLoading}
                  error={analysisError}
                  hasAttempted={hasAttemptedAnalysis}
                  status={analysisStatus}
                  theme={theme}
                  onThemeChange={setTheme}
                />
              ) : null}
              
              {activeScreen === 'compare' ? (
                <CompareScreen
                  analysis={analysis}
                  selectedAudio={selectedAudio}
                  availableAudio={availableAnalysisAudio}
                  loading={analysisLoading}
                  error={analysisError}
                  onSelectAudio={handleCompareSelectAudio}
                  onAnalyzeAudio={handleAnalyze}
                  theme={theme}
                />
              ) : null}
              
              {activeScreen === 'settings' ? (
                <SettingsPageV2
                  theme={theme}
                  onThemeChange={setTheme}
                  currentUser={currentUser}
                  onLogout={handleLogout}
                  onChangePasswordClick={() => setChangePasswordOpen(true)}
                />
              ) : null}
            </div>
          )}
        </main>
      </div>

      {profileOpen && (
        <UserProfileModal
          user={currentUser}
          onClose={() => setProfileOpen(false)}
        />
      )}

      {changePasswordOpen && (
        <ChangePasswordModal
          onClose={() => setChangePasswordOpen(false)}
        />
      )}

      {showDetailsModal && (
        <TransmissionDetailsModal
          isOpen={showDetailsModal}
          onClose={() => {
            setShowDetailsModal(false)
            setDetailsAudio(null)
          }}
          audio={detailsAudio}
          showToast={showToast}
        />
      )}

      {showForwardModal && (
        <RecipientModal
          isOpen={showForwardModal}
          onClose={() => {
            setShowForwardModal(false)
            setForwardingAudio(null)
          }}
          users={users}
          onlineUsers={onlineUsers}
          recentUsers={recentUsers}
          onConfirm={handleForwardConfirm}
        />
      )}

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={cn(
              "fixed bottom-6 right-6 z-[200] flex items-center gap-2 rounded-2xl border px-4 py-3 text-[13.5px] font-semibold text-white shadow-2xl backdrop-blur-md",
              toast.type === 'success' ? 'border-emerald-500/30 bg-emerald-950/85' : 
              toast.type === 'error' ? 'border-red-500/30 bg-red-950/85' : 
              'border-aura-accent/30 bg-aura-surface/85'
            )}
          >
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App
