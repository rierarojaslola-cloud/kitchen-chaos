import { randomInt } from 'node:crypto';
import { generateRoomCode, ROOM_IDLE_TIMEOUT_S, type SavedProgress } from '@kc/shared';
import { DEFAULT_ROOM_OPTIONS, Room, type RoomOptions } from './room';

export class RoomManager {
  private rooms = new Map<string, Room>();
  private sweeper: NodeJS.Timeout | null = null;

  constructor(
    private readonly maxRooms: number,
    private readonly roomOptions: RoomOptions = DEFAULT_ROOM_OPTIONS,
    private readonly idleTimeoutMs = ROOM_IDLE_TIMEOUT_S * 1000,
  ) {}

  start(sweepMs = 5000): void {
    this.sweeper = setInterval(() => this.sweep(), sweepMs);
  }

  stop(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    for (const r of this.rooms.values()) r.close('El servidor s’està aturant.');
    this.rooms.clear();
  }

  create(progress?: SavedProgress): Room | null {
    if (this.rooms.size >= this.maxRooms) {
      this.sweep();
      if (this.rooms.size >= this.maxRooms) return null;
    }
    let code = '';
    for (let i = 0; i < 50; i++) {
      code = generateRoomCode((n) => randomInt(n));
      if (!this.rooms.has(code)) break;
    }
    if (this.rooms.has(code)) return null;
    const room = new Room(code, this.roomOptions, progress);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  remove(code: string, reason: string): void {
    const r = this.rooms.get(code);
    if (!r) return;
    r.close(reason);
    this.rooms.delete(code);
  }

  sweep(): void {
    for (const [code, r] of this.rooms) {
      r.dropExpired();
      if (r.isExpired(this.idleTimeoutMs)) {
        r.close('La sala ha caducat per inactivitat.');
        this.rooms.delete(code);
      }
    }
  }

  get size(): number {
    return this.rooms.size;
  }
}
