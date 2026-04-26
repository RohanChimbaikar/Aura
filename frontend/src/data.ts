import type { InboxStatus } from './types'

export const composePreview = {
  fileName: 'briefing_01.wav',
  duration: '01:12',
  capacity: '18 chars / min',
  encryptionStatus: 'Armed',
  integrity: '0.98 stable',
  recipient: 'Elena Park',
  output: 'WAV / 48 kHz',
  readiness: 'Ready',
  recoverability: '96.4%',
  confidence: '0.87',
  density: 'Low-band / 12%',
  deviation: '0.03 dB',
}

export const inboxItems: Array<{
  id: string
  sender: string
  initials: string
  fileName: string
  received: string
  status: InboxStatus
  trust: string
  note: string
}> = [
  {
    id: '1',
    sender: 'Elena Park',
    initials: 'EP',
    fileName: 'voice_note_14.wav',
    received: 'Today, 09:18',
    status: 'Verified',
    trust: 'Integrity 0.99',
    note: 'Recovered envelope present',
  },
  {
    id: '2',
    sender: 'Marcus Hale',
    initials: 'MH',
    fileName: 'transmission_03.wav',
    received: 'Today, 07:42',
    status: 'Pending Reveal',
    trust: 'Awaiting key',
    note: 'Encrypted stego channel detected',
  },
  {
    id: '3',
    sender: 'R. Iyer',
    initials: 'RI',
    fileName: 'briefing_delta.wav',
    received: 'Yesterday, 22:11',
    status: 'Encrypted',
    trust: 'Signature intact',
    note: 'Ready for secure extraction',
  },
]

export const revealResult = {
  fileName: 'voice_note_14.wav',
  sender: 'Elena Park',
  receivedAt: 'April 18, 2026 · 09:18',
  payloadLength: '42 chars',
  confidence: '97.2%',
  integrity: 'Verified',
  message:
    'Meet at the east entrance after the second playback window.',
  bitConfidence: '0.94',
  signalMatch: 'Aligned / 11 regions',
  extraction: 'Recovered cleanly',
  redundancy: 'ECC pass · 2 redundant frames',
}

export const analysisResult = {
  fileName: 'field_capture.wav',
  duration: '00:58',
  likelihood: 'Moderate',
  confidence: '81.6%',
  suspiciousness: 'Contained',
  anomaly: '00:19–00:24 · upper-mid band',
  payloadEstimate: 'Estimated 34–48 chars',
}
