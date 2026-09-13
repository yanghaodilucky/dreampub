import { Input, Math as PhaserMath, Scene, Scenes } from 'phaser';
import { gameBridge, type FocusStarted } from '../bridge/GameBridge';

type Seat = {
  id: string;
  label: string;
  x: number;
  y: number;
};

type Obstacle = { x: number; y: number; width: number; height: number };

const WORLD_WIDTH = 960;
const WORLD_HEIGHT = 600;
const PLAYER_SIZE = 22;

export class LibraryScene extends Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private playerLabel!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private interactKey!: Phaser.Input.Keyboard.Key;
  private seats: Seat[] = [
    { id: 'desk-window-01', label: '窗边书桌', x: 620, y: 388 },
    { id: 'desk-window-02', label: '窗边书桌', x: 750, y: 388 },
    { id: 'desk-center-01', label: '长桌座位', x: 445, y: 275 },
  ];
  private obstacles: Obstacle[] = [];
  private occupiedSeatId: string | null = null;
  private isFocusing = false;
  private unsubscribeFocus?: () => void;
  private unsubscribeStopped?: () => void;

  constructor() {
    super('LibraryScene');
  }

  create() {
    try {
      this.drawRoom();
      this.createPlayer();
      this.createNpcs();
      this.createInput();
      this.unsubscribeFocus = gameBridge.on('focus.started', (focus) => this.startFocus(focus));
      this.unsubscribeStopped = gameBridge.on('focus.stopped', () => this.stopFocus());
      this.events.once(Scenes.Events.SHUTDOWN, this.cleanUp, this);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown scene setup error';
      gameBridge.emit('game.error', { message });
      throw error;
    }
  }

  update(_: number, delta: number) {
    if (this.isFocusing) {
      return;
    }

    const speed = 0.15 * delta;
    let dx = 0;
    let dy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) dx -= speed;
    if (this.cursors.right.isDown || this.wasd.D.isDown) dx += speed;
    if (this.cursors.up.isDown || this.wasd.W.isDown) dy -= speed;
    if (this.cursors.down.isDown || this.wasd.S.isDown) dy += speed;

    if (dx !== 0 || dy !== 0) {
      const length = Math.hypot(dx, dy);
      this.movePlayer((dx / length) * speed, (dy / length) * speed);
    }

    const closestSeat = this.closestSeat();
    this.hintText.setText(
      closestSeat
        ? `按 E 坐到${closestSeat.label}`
        : '方向键 / WASD 移动 · 靠近书桌后按 E',
    );

    if (Input.Keyboard.JustDown(this.interactKey) && closestSeat) {
      this.sitAt(closestSeat);
    }
  }

  private drawRoom() {
    this.cameras.main.setBackgroundColor('#1d2030');
    const graphics = this.add.graphics();
    graphics.fillStyle(0x4a2c2a, 1);
    graphics.fillRect(20, 20, WORLD_WIDTH - 40, WORLD_HEIGHT - 40);
    graphics.fillStyle(0xb56d4c, 1);
    graphics.fillRect(44, 44, WORLD_WIDTH - 88, WORLD_HEIGHT - 88);

    graphics.lineStyle(1, 0x8a4b3a, 0.5);
    for (let x = 44; x < WORLD_WIDTH - 44; x += 32) graphics.lineBetween(x, 44, x, WORLD_HEIGHT - 44);
    for (let y = 44; y < WORLD_HEIGHT - 44; y += 32) graphics.lineBetween(44, y, WORLD_WIDTH - 44, y);

    this.drawShelf(graphics, 90, 78, 220, 62);
    this.drawShelf(graphics, 350, 78, 220, 62);
    this.drawShelf(graphics, 650, 78, 220, 62);
    this.addObstacle(90, 78, 220, 62);
    this.addObstacle(350, 78, 220, 62);
    this.addObstacle(650, 78, 220, 62);

    this.drawDesk(graphics, 395, 248, 116, 62);
    this.drawDesk(graphics, 570, 360, 100, 66);
    this.drawDesk(graphics, 700, 360, 100, 66);
    this.addObstacle(395, 248, 116, 62);
    this.addObstacle(570, 360, 100, 66);
    this.addObstacle(700, 360, 100, 66);

    graphics.fillStyle(0x2b3f58, 1);
    graphics.fillRect(805, 190, 80, 118);
    graphics.fillStyle(0x6eb7c4, 0.7);
    graphics.fillRect(812, 198, 66, 102);
    this.addObstacle(805, 190, 80, 118);

    graphics.fillStyle(0xf8c36b, 1);
    graphics.fillCircle(154, 480, 24);
    graphics.fillStyle(0xe67d4e, 1);
    graphics.fillCircle(154, 480, 14);

    this.add.text(66, 52, 'DREAM PUB · LIBRARY', {
      color: '#fff1d0', fontFamily: 'monospace', fontSize: '14px', letterSpacing: 2,
    });
    this.statusText = this.add.text(46, 556, '漫游中', {
      color: '#4f2d2d', fontFamily: 'monospace', fontSize: '13px',
    });
    this.hintText = this.add.text(480, 556, '方向键 / WASD 移动 · 靠近书桌后按 E', {
      color: '#4f2d2d', fontFamily: 'monospace', fontSize: '13px',
    }).setOrigin(0.5, 0);
  }

  private drawShelf(graphics: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number) {
    graphics.fillStyle(0x31415d, 1);
    graphics.fillRoundedRect(x, y, width, height, 5);
    graphics.fillStyle(0x182333, 1);
    graphics.fillRect(x + 8, y + 12, width - 16, 7);
    graphics.fillRect(x + 8, y + 38, width - 16, 7);
    const colors = [0xf2bd68, 0xa9d9c3, 0xd27f77, 0x9f89c8, 0xf0e2bc];
    for (let book = 0; book < 14; book += 1) {
      graphics.fillStyle(colors[book % colors.length], 1);
      graphics.fillRect(x + 12 + book * 14, y + (book % 2 === 0 ? 16 : 42), 8, 15);
    }
  }

  private drawDesk(graphics: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number) {
    graphics.fillStyle(0x72473a, 1);
    graphics.fillRoundedRect(x, y, width, height, 4);
    graphics.fillStyle(0xd38b59, 1);
    graphics.fillRect(x + 8, y + 8, width - 16, 10);
    graphics.fillStyle(0x402a2f, 1);
    graphics.fillRect(x + 16, y + height - 8, 8, 18);
    graphics.fillRect(x + width - 24, y + height - 8, 8, 18);
    graphics.fillStyle(0xffd774, 1);
    graphics.fillCircle(x + width / 2, y + 28, 5);
  }

  private addObstacle(x: number, y: number, width: number, height: number) {
    this.obstacles.push({ x, y, width, height });
  }

  private createPlayer() {
    this.player = this.add.rectangle(250, 430, PLAYER_SIZE, PLAYER_SIZE, 0x67b7d1).setStrokeStyle(2, 0xf3f5e8);
    this.playerLabel = this.add.text(250, 448, 'You', {
      color: '#fff1d0', fontFamily: 'monospace', fontSize: '12px',
    }).setOrigin(0.5, 0);
  }

  private createNpcs() {
    this.createNpc(244, 210, 0xd18ba5, 'Mira', '插画集');
    this.createNpc(542, 455, 0x9ecc8b, 'Lin', '整理馆藏');
  }

  private createNpc(x: number, y: number, color: number, name: string, activity: string) {
    this.add.rectangle(x, y, PLAYER_SIZE, PLAYER_SIZE, color).setStrokeStyle(2, 0xf3f5e8);
    this.add.text(x, y + 18, name, { color: '#fff1d0', fontFamily: 'monospace', fontSize: '12px' }).setOrigin(0.5, 0);
    this.add.text(x, y + 34, activity, { color: '#4f2d2d', fontFamily: 'monospace', fontSize: '10px' }).setOrigin(0.5, 0);
  }

  private createInput() {
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is unavailable.');
    this.cursors = keyboard.createCursorKeys();
    this.wasd = {
      W: keyboard.addKey('W'),
      A: keyboard.addKey('A'),
      S: keyboard.addKey('S'),
      D: keyboard.addKey('D'),
    };
    this.interactKey = keyboard.addKey('E');
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isFocusing) return;
      const seat = this.seats.find(
        (candidate) => Math.hypot(pointer.worldX - candidate.x, pointer.worldY - candidate.y) < 38,
      );
      if (seat) this.sitAt(seat);
    });
  }

  private movePlayer(dx: number, dy: number) {
    const x = PhaserMath.Clamp(this.player.x + dx, 60, WORLD_WIDTH - 60);
    const y = PhaserMath.Clamp(this.player.y + dy, 170, WORLD_HEIGHT - 75);
    if (this.collides(x, y)) return;
    this.player.setPosition(x, y);
    this.playerLabel.setPosition(x, y + 18);
  }

  private collides(x: number, y: number) {
    const padding = PLAYER_SIZE / 2;
    return this.obstacles.some((obstacle) =>
      x + padding > obstacle.x && x - padding < obstacle.x + obstacle.width &&
      y + padding > obstacle.y && y - padding < obstacle.y + obstacle.height,
    );
  }

  private closestSeat() {
    return this.seats.find((seat) => Math.hypot(this.player.x - seat.x, this.player.y - seat.y) < 52) ?? null;
  }

  private sitAt(seat: Seat) {
    this.occupiedSeatId = seat.id;
    this.player.setPosition(seat.x, seat.y);
    this.playerLabel.setPosition(seat.x, seat.y + 18);
    this.statusText.setText(`已坐在${seat.label}`);
    gameBridge.emit('desk.interacted', { seatId: seat.id, label: seat.label });
  }

  private startFocus(focus: FocusStarted) {
    if (this.occupiedSeatId !== focus.seatId) return;
    this.isFocusing = true;
    this.player.setFillStyle(0x6fcf97);
    this.statusText.setText(`正在专注：${focus.taskTitle}`);
    this.hintText.setText('正在工作 · 结束专注后可以继续漫游');
  }

  private stopFocus() {
    this.isFocusing = false;
    this.player.setFillStyle(0x67b7d1);
    this.statusText.setText('专注已停止');
  }

  private cleanUp() {
    this.unsubscribeFocus?.();
    this.unsubscribeStopped?.();
  }
}
