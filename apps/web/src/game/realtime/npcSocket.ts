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
type NpcSpokeMessage = { kind: 'world.event'; event: { type: 'npc.spoke'; event_id: string; actor_id: string; payload: { content: string } } };

export class NpcSocket {
  private socket?: WebSocket;
  private reconnectTimer?: number;
  private closed = false;
  private readonly seenEventIds = new Set<string>();

  constructor(
    private readonly onStates: (states: NpcWorldState[]) => void,
    private readonly onSpoke: (npcId: string, content: string, eventId: string) => void,
  ) {}

  connect() {
    if (this.closed || this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return;
    const configuredUrl = import.meta.env.VITE_NPC_SERVER_URL;
    const socketUrl = configuredUrl ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8000/ws/world/dream-cafe`;
    const socket = new WebSocket(socketUrl);
    this.socket = socket;
    socket.onmessage = (event) => {
      // A scene restart can leave an old browser socket closing briefly. Its
      // late packets must not be rendered by the new scene.
      if (this.socket !== socket || this.closed) return;
      try {
        const message = JSON.parse(event.data) as WorldMessage | NpcSpokeMessage;
        if (message.kind === 'snapshot' || message.kind === 'state.delta') {
          this.onStates(message.entities.filter((entity) => entity.actor_kind === 'npc'));
        }
        if (message.kind === 'world.event' && message.event.type === 'npc.spoke') {
          if (this.seenEventIds.has(message.event.event_id)) return;
          this.seenEventIds.add(message.event.event_id);
          if (this.seenEventIds.size > 200) this.seenEventIds.delete(this.seenEventIds.values().next().value!);
          this.onSpoke(message.event.actor_id, message.event.payload.content, message.event.event_id);
        }
      } catch {
        // Invalid wire data is ignored; the local NPC fallback remains visible.
      }
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      if (!this.closed) this.reconnectTimer = window.setTimeout(() => this.connect(), 3000);
    };
  }

  close() {
    this.closed = true;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
  }

  sendPlayerPosition(x: number, y: number) {
    this.send({ kind: 'player.position', x, y });
  }

  sendChat(content: string) {
    this.send({ kind: 'npc.message', message_id: crypto.randomUUID(), content });
  }

  private send(message: object) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
}
