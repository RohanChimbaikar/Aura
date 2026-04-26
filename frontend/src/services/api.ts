import type {
  AnalysisPayload,
  AudioTransfer,
  ChatMessage,
  DecodeResult,
  EncodePreview,
  EncodeResult,
  Message,
  User,
} from '../types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

type SessionResponse = {
  authenticated: boolean
  user: User | null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api${path}`, {
    credentials: 'include',
    ...init,
    headers:
      init?.body instanceof FormData
        ? init.headers
        : {
            'Content-Type': 'application/json',
            ...(init?.headers ?? {}),
          },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || 'Request failed.')
  }
  return data as T
}

export function resolveUrl(path = '') {
  if (!path) return ''
  if (path.startsWith('http')) return path
  if (path.startsWith('/outputs/')) return `${API_BASE_URL}/api${path}`
  return `${API_BASE_URL}${path}`
}

export async function getSession(): Promise<SessionResponse> {
  return request<SessionResponse>('/auth/session')
}

export async function login(username: string, password: string): Promise<User> {
  const response = await request<{ user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  return response.user
}

export async function logout(): Promise<void> {
  await request('/auth/logout', { method: 'POST' })
}

export async function getUsers(): Promise<User[]> {
  const response = await request<{ users: User[] }>('/chat/users')
  return response.users
}

export async function getConversationHistory(otherUsername: string): Promise<Message[]> {
  const response = await request<{ messages: Message[] }>(
    `/chat/history/${encodeURIComponent(otherUsername)}`,
  )
  return response.messages
}

export async function getFiles(direction?: 'received' | 'sent'): Promise<AudioTransfer[]> {
  const query = direction ? `?direction=${direction}` : ''
  const response = await request<{ files: AudioTransfer[] }>(`/files${query}`)
  return response.files
}

export async function uploadWavFile(
  receiver: string,
  file: File,
): Promise<AudioTransfer> {
  const formData = new FormData()
  formData.append('receiver', receiver)
  formData.append('file', file)

  const response = await request<{ file: AudioTransfer }>('/files/upload', {
    method: 'POST',
    body: formData,
  })
  return response.file
}

export function previewEncode(text: string) {
  return request<EncodePreview>('/encode/preview', {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

export function encodeAudio(text: string) {
  return request<EncodeResult>('/encode', {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

export function decodeByReference(messageId: string, audioUrl?: string) {
  return request<DecodeResult>('/decode', {
    method: 'POST',
    body: JSON.stringify({ message_id: messageId, audio_url: audioUrl }),
  })
}

export function decodeUpload(file: File) {
  const form = new FormData()
  form.append('file', file)
  return request<DecodeResult>('/decode', {
    method: 'POST',
    body: form,
  })
}

export async function getMessages() {
  const response = await request<{ messages: ChatMessage[] }>('/messages')
  return response.messages
}

export function createMessage(payload: Omit<ChatMessage, 'id'>) {
  return request<ChatMessage>('/messages', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getAnalysis(messageId: string) {
  return request<AnalysisPayload>(`/messages/${messageId}/analysis`)
}

export function getDownloadUrl(transferId: number | string) {
  return `${API_BASE_URL}/api/files/${transferId}/download`
}

export function getAudioUrl(transferId: number | string) {
  return getDownloadUrl(transferId)
}

export async function decodeAudioTransfer(transferId: number | string) {
  const result = await request<DecodeResult & { recoveredText?: string }>(
    `/files/${transferId}/decode`,
    { method: 'POST' },
  )
  return {
    ...result,
    recoveredText: result.recoveredText ?? result.corrected_text ?? result.raw_text,
  }
}
