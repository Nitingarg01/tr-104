// Lightweight WebSocket wrapper for receiving live caption streams
export type CaptionLine = {
  start: number
  end: number
  text: string
}

export class LiveCaptionSocket {
  private ws?: WebSocket
  private url: string
  private onMessage?: (line: CaptionLine) => void
  private reconnectMs: number

  constructor(url: string, onMessage?: (line: CaptionLine) => void) {
    this.url = url
    this.onMessage = onMessage
    this.reconnectMs = 2000
    this.connect()
  }

  private connect() {
    try {
      this.ws = new WebSocket(this.url)
      this.ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data)
          if (data && data.start != null && data.end != null && data.text) {
            this.onMessage?.({ start: data.start, end: data.end, text: data.text })
          }
        } catch {
          // ignore parse errors
        }
      }
      this.ws.onclose = () => {
        // attempt reconnect
        setTimeout(() => this.connect(), this.reconnectMs)
      }
    } catch {
      setTimeout(() => this.connect(), this.reconnectMs)
    }
  }
  close() {
    this.ws?.close()
  }
}
