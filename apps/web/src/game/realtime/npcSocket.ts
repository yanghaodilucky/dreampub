export type NpcWorldState = {
  actor_id: string;
  actor_kind: 'npc';
  x: number;
  y: number;
  state: 'idle' | 'moving' | 'working' | 'break' | 'offstage';
  activity?: string;
  visible?: boolean;
};

type WorldMessage = { kind: 'snapshot' | 'state.delta'; entities: NpcWorldState[] };

export class NpcSocket {
  private socket?: WebSocket;
  private reconnectTimer?: number;
  private closed = false;

  constructor(private readonly onStates: (states: NpcWorldState[]) => void) {}

  connect() {
    const configuredUrl = import.meta.env.VITE_NPC_SERVER_URL;
    const socketUrl = configuredUrl ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8000/ws/world/dream-cafe`;
    this.socket = new WebSocket(socketUrl);
    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WorldMessage;
        if (message.kind === 'snapshot' || message.kind === 'state.delta') {
          this.onStates(message.entities.filter((entity) => entity.actor_kind === 'npc'));
        }
      } catch {
        // Invalid wire data is ignored; the local NPC fallback remains visible.
      }
    };
    this.socket.onclose = () => {
      if (!this.closed) this.reconnectTimer = window.setTimeout(() => this.connect(), 3000);
    };
  }

  close() {
    this.closed = true;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }
}
