export type FocusSpot = { seatId: string; label: string };
export type FocusStarted = { taskId: string; taskTitle: string; seatId: string };

type BridgeEvents = {
  'focus.open': FocusSpot | null;
  'tasks.open': undefined;
  'focus.started': FocusStarted;
  'focus.stopped': undefined;
  'game.error': { message: string };
};

type Listener<T> = (payload: T) => void;

class GameBridge {
  private listeners = new Map<keyof BridgeEvents, Set<Listener<never>>>();

  emit<K extends keyof BridgeEvents>(event: K, payload: BridgeEvents[K]) {
    this.listeners.get(event)?.forEach((listener) => listener(payload as never));
  }

  on<K extends keyof BridgeEvents>(event: K, listener: Listener<BridgeEvents[K]>) {
    const listeners = this.listeners.get(event) ?? new Set<Listener<never>>();
    listeners.add(listener as Listener<never>);
    this.listeners.set(event, listeners);

    return () => {
      listeners.delete(listener as Listener<never>);
    };
  }
}

export const gameBridge = new GameBridge();
