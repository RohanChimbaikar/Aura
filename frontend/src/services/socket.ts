import { io, type Socket } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? window.location.origin

let socket: Socket | null = null

export function connectSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      withCredentials: true,
      path: '/socket.io',
    })
  }

  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
}

export function onSocketEvent(event: string, listener: (...args: any[]) => void) {
  connectSocket().on(event, listener)
}

export function offSocketEvent(event: string, listener: (...args: any[]) => void) {
  socket?.off(event, listener)
}
