import { Input, Math as PhaserMath, Scene, Scenes } from 'phaser';
import { gameBridge, type FocusStarted, type FocusSpot } from '../bridge/GameBridge';

type Obstacle = { x: number; y: number; width: number; height: number };

const WORLD_WIDTH = 1200;
const WORLD_HEIGHT = 820;
const PLAYER_SIZE = 22;

export class CafeScene extends Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private playerLabel!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private interactKey!: Phaser.Input.Keyboard.Key;
  private focusSpots: FocusSpot[] = [
    { seatId: 'window-two-01', label: '西窗双人桌' },
    { seatId: 'window-four-01', label: '西窗四人桌' },
    { seatId: 'window-two-02', label: '西窗双人桌' },
    { seatId: 'community-01', label: '中央长桌' },
  ];
  private focusCoordinates = new Map<string, { x: number; y: number }>([
    ['window-two-01', { x: 295, y: 310 }],
    ['window-four-01', { x: 316, y: 460 }],
    ['window-two-02', { x: 295, y: 610 }],
    ['community-01', { x: 560, y: 470 }],
  ]);
  private obstacles: Obstacle[] = [];
  private occupiedSeatId: string | null = null;
  private isFocusing = false;
  private unsubscribeFocus?: () => void;
  private unsubscribeStopped?: () => void;

  constructor() {
    super('CafeScene');
  }

  create() {
    try {
      this.drawCafe();
      this.createPeople();
      this.createInput();
      this.createHotspots();
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
    if (this.isFocusing) return;

    const speed = 0.16 * delta;
    let dx = 0;
    let dy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) dx -= speed;
    if (this.cursors.right.isDown || this.wasd.D.isDown) dx += speed;
    if (this.cursors.up.isDown || this.wasd.W.isDown) dy -= speed;
    if (this.cursors.down.isDown || this.wasd.S.isDown) dy += speed;
    if (dx || dy) {
      const length = Math.hypot(dx, dy);
      this.movePlayer((dx / length) * speed, (dy / length) * speed);
    }

    const closest = this.closestFocusSpot();
    const boardNearby = this.isNearBoard();
    this.hintText.setText(
      boardNearby ? '按 E 打开右墙项目板' : closest ? `按 E 坐到${closest.label}` : '方向键 / WASD 移动 · 点击桌子或项目板',
    );
    if (Input.Keyboard.JustDown(this.interactKey)) {
      if (boardNearby) gameBridge.emit('tasks.open', undefined);
      else if (closest) this.useFocusSpot(closest);
    }
  }

  private drawCafe() {
    const graphics = this.add.graphics();
    const hour = new Date().getHours();
    const daylight = hour >= 7 && hour < 18;
    const phase = hour < 7 || hour >= 20 ? '夜晚' : hour < 11 ? '早晨' : hour < 16 ? '午后' : '傍晚';

    this.cameras.main.setBackgroundColor(daylight ? '#83b2c1' : '#182237');
    graphics.fillStyle(daylight ? 0x62787a : 0x263246, 1);
    graphics.fillRect(0, 0, 104, WORLD_HEIGHT);
    graphics.fillStyle(daylight ? 0xb9aa91 : 0x4b5160, 1);
    graphics.fillRect(86, 0, 12, WORLD_HEIGHT);
    graphics.fillStyle(daylight ? 0xdfd0ac : 0x677083, 1);
    graphics.fillRect(99, 0, 5, WORLD_HEIGHT);
    graphics.lineStyle(1, daylight ? 0x8e9b99 : 0x40516a, 0.9);
    for (let y = 0; y < WORLD_HEIGHT; y += 22) {
      graphics.lineBetween(7, y, 83, y);
      if ((y / 22) % 2 === 0) graphics.lineBetween(45, y, 45, y + 22);
    }
    graphics.lineStyle(2, daylight ? 0xefdaaa : 0x5b6272, 0.85);
    for (let y = 10; y < WORLD_HEIGHT; y += 56) graphics.lineBetween(48, y, 48, y + 25);
    this.drawPlaneTree(graphics, 34, 166, daylight);
    this.drawPlaneTree(graphics, 62, 430, daylight);
    this.drawPlaneTree(graphics, 33, 700, daylight);
    this.add.text(10, 48, 'RUE\nDES\nRÊVES', { color: '#edf0df', fontFamily: 'monospace', fontSize: '9px', lineSpacing: 2, letterSpacing: 1 });

    graphics.fillStyle(0x332728, 1);
    graphics.fillRoundedRect(104, 35, 1056, 750, 10);
    graphics.fillStyle(0xc78762, 1);
    graphics.fillRect(134, 65, 1000, 690);
    graphics.lineStyle(1, 0x9d614e, 0.62);
    for (let x = 134; x < 1135; x += 35) graphics.lineBetween(x, 65, x, 755);
    for (let y = 65; y < 756; y += 35) graphics.lineBetween(134, y, 1134, y);

    this.drawNorthBar(graphics);
    this.drawWestWindows(graphics, daylight, hour);
    this.drawEntrance(graphics);
    this.drawCommunityTable(graphics);
    this.drawWindowTables(graphics);
    this.drawFireplaceAndSofas(graphics, hour >= 20 || hour < 7);
    this.drawProjectBoard(graphics);

    this.add.text(188, 90, 'DREAM CAFE', { color: '#fff0ce', fontFamily: 'Georgia, serif', fontSize: '21px', fontStyle: 'bold', letterSpacing: 2 });
    this.add.text(188, 116, `西窗朝街 · ${phase} · ${daylight ? '窗边日光' : '壁炉时间'}`, { color: '#653e3c', fontFamily: 'monospace', fontSize: '12px' });
    this.statusText = this.add.text(188, 720, '漫游中', { color: '#623e3c', fontFamily: 'monospace', fontSize: '13px' });
    this.hintText = this.add.text(650, 720, '方向键 / WASD 移动 · 点击桌子或项目板', { color: '#623e3c', fontFamily: 'monospace', fontSize: '13px' }).setOrigin(0.5, 0);

    this.addObstacle(700, 100, 370, 80);
    this.addObstacle(700, 160, 80, 150);
    this.addObstacle(500, 300, 120, 320);
    this.addObstacle(1018, 490, 88, 130);
    this.addObstacle(850, 570, 105, 76);
    this.addObstacle(850, 665, 105, 76);
    this.addObstacle(970, 650, 115, 78);
    this.addObstacle(1042, 318, 60, 126);
    this.addObstacle(250, 275, 90, 54);
    this.addObstacle(250, 415, 132, 64);
    this.addObstacle(250, 575, 90, 54);
  }

  private drawPlaneTree(graphics: Phaser.GameObjects.Graphics, x: number, y: number, daylight: boolean) {
    const leaves = daylight ? [0x37594c, 0x4e704f, 0x6f8f59, 0x9aae67] : [0x263d47, 0x304a4d, 0x3c5b54, 0x566f5d];
    graphics.fillStyle(daylight ? 0x48504b : 0x28313c, 0.28);
    graphics.fillEllipse(x + 15, y + 48, 58, 13);
    graphics.fillStyle(0x56433a, 1);
    graphics.fillRect(x - 4, y - 51, 9, 99);
    graphics.fillStyle(0x80604a, 1);
    graphics.fillRect(x + 2, y - 49, 3, 96);
    graphics.lineStyle(3, 0x56433a, 1);
    graphics.lineBetween(x, y - 18, x - 22, y - 62);
    graphics.lineBetween(x + 3, y - 28, x + 27, y - 67);
    graphics.lineBetween(x, y - 45, x - 7, y - 84);
    const clusters = [[-18, -69, 18], [5, -88, 20], [24, -69, 17], [-2, -105, 17], [-26, -91, 13], [29, -94, 13], [8, -59, 18]];
    clusters.forEach(([offsetX, offsetY, radius], index) => {
      graphics.fillStyle(leaves[index % leaves.length], 1);
      graphics.fillCircle(x + offsetX, y + offsetY, radius);
      graphics.fillStyle(leaves[(index + 2) % leaves.length], 0.8);
      graphics.fillCircle(x + offsetX - radius * 0.28, y + offsetY - radius * 0.3, radius * 0.42);
    });
    graphics.fillStyle(daylight ? 0xd8c57b : 0x6d7a67, 0.75);
    graphics.fillCircle(x - 11, y - 101, 3);
    graphics.fillCircle(x + 21, y - 78, 2);
    graphics.fillCircle(x - 27, y - 75, 2);
  }

  private drawNorthBar(graphics: Phaser.GameObjects.Graphics) {
    graphics.fillStyle(0x483347, 1);
    graphics.fillRoundedRect(700, 100, 370, 80, 8);
    graphics.fillRoundedRect(700, 160, 80, 150, 8);
    graphics.fillStyle(0x82564e, 1);
    graphics.fillRect(718, 121, 334, 20);
    graphics.fillRect(720, 160, 20, 132);
    graphics.fillStyle(0xf3be69, 1);
    graphics.fillCircle(792, 151, 11);
    graphics.fillCircle(860, 151, 11);
    graphics.fillStyle(0x263945, 1);
    graphics.fillRect(940, 138, 78, 30);
    graphics.fillStyle(0xd9d3c4, 1);
    graphics.fillCircle(978, 153, 12);
    graphics.fillCircle(749, 220, 10);
    this.add.text(808, 106, 'COFFEE BAR', { color: '#fff0ce', fontFamily: 'monospace', fontSize: '13px', letterSpacing: 1 });
  }

  private drawWestWindows(graphics: Phaser.GameObjects.Graphics, daylight: boolean, hour: number) {
    const windows = [252, 402, 552];
    graphics.fillStyle(daylight ? 0x8fc7d0 : 0x253954, 1);
    for (const y of windows) {
      graphics.fillRoundedRect(136, y, 48, 104, 4);
      graphics.lineStyle(2, 0xf5e0b5, 0.9);
      graphics.lineBetween(140, y + 52, 180, y + 52);
      graphics.lineBetween(160, y + 4, 160, y + 100);
    }

    if (daylight) {
      const shift = hour < 11 ? -85 : hour < 16 ? 0 : 85;
      graphics.fillStyle(0xffdc8a, 0.14);
      for (const y of windows) {
        graphics.fillTriangle(186, y + 14, 186, y + 90, 392, y + 52 + shift);
      }
    }
  }

  private drawEntrance(graphics: Phaser.GameObjects.Graphics) {
    graphics.fillStyle(0x25313b, 1);
    graphics.fillRect(136, 132, 27, 88);
    graphics.fillStyle(0xf0cd91, 1);
    graphics.fillRect(143, 139, 12, 74);
    this.add.text(174, 170, '入口', { color: '#633d3a', fontFamily: 'monospace', fontSize: '11px' });
  }

  private drawCommunityTable(graphics: Phaser.GameObjects.Graphics) {
    graphics.fillStyle(0x704940, 1);
    graphics.fillRoundedRect(500, 300, 120, 320, 8);
    graphics.fillStyle(0xd19a68, 1);
    graphics.fillRect(512, 314, 14, 292);
    for (let y = 330; y < 600; y += 52) {
      graphics.fillStyle(0x49333a, 1);
      graphics.fillCircle(485, y, 13);
      graphics.fillCircle(635, y, 13);
    }
    this.add.text(560, 460, 'COMMUNITY TABLE', { color: '#ffe8c0', fontFamily: 'monospace', fontSize: '12px', letterSpacing: 1 }).setOrigin(0.5).setAngle(-90);
  }

  private drawWindowTables(graphics: Phaser.GameObjects.Graphics) {
    this.drawTable(graphics, 250, 275, 90, 54, '2');
    this.drawTable(graphics, 250, 415, 132, 64, '4');
    this.drawTable(graphics, 250, 575, 90, 54, '2');
  }

  private drawTable(graphics: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number, capacity: string) {
    graphics.fillStyle(0x71483f, 1);
    graphics.fillRoundedRect(x, y, width, height, 6);
    graphics.fillStyle(0xe4b16f, 1);
    graphics.fillRect(x + 8, y + 8, width - 16, 12);
    graphics.fillStyle(0x4a3339, 1);
    graphics.fillCircle(x + 20, y + height + 9, 12);
    graphics.fillCircle(x + width - 20, y + height + 9, 12);
    if (capacity === '4') {
      graphics.fillCircle(x + 20, y - 8, 12);
      graphics.fillCircle(x + width - 20, y - 8, 12);
    }
    this.add.text(x + width / 2, y + 29, `${capacity}人桌`, { color: '#ffe8c0', fontFamily: 'monospace', fontSize: '11px' }).setOrigin(0.5, 0);
  }

  private drawFireplaceAndSofas(graphics: Phaser.GameObjects.Graphics, isNight: boolean) {
    graphics.fillStyle(0x483039, 1);
    graphics.fillRoundedRect(1018, 490, 88, 130, 8);
    graphics.fillStyle(0x2a2834, 1);
    graphics.fillRect(1032, 518, 60, 64);
    if (isNight) {
      graphics.fillStyle(0xf46b3f, 1);
      graphics.fillTriangle(1043, 571, 1062, 528, 1082, 571);
      graphics.fillStyle(0xffce66, 1);
      graphics.fillTriangle(1051, 571, 1062, 544, 1074, 571);
    } else {
      graphics.fillStyle(0x8c5d42, 1);
      graphics.fillRect(1040, 566, 44, 8);
    }
    this.drawArmchair(graphics, 850, 570, 105, 76);
    this.drawArmchair(graphics, 850, 665, 105, 76);
    this.drawBeanBag(graphics, 970, 650, 115, 78);
    this.add.text(1018, 476, isNight ? '炉火正暖' : '壁炉', { color: '#633d3a', fontFamily: 'monospace', fontSize: '11px' });
  }

  private drawArmchair(graphics: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number) {
    graphics.fillStyle(0x4f645f, 1);
    graphics.fillRoundedRect(x, y, width, height, 16);
    graphics.fillStyle(0x78938a, 1);
    graphics.fillRoundedRect(x + 12, y + 12, width - 24, 29, 11);
    graphics.fillStyle(0xa6bca8, 1);
    graphics.fillRoundedRect(x + 19, y + 22, width - 38, 27, 10);
    graphics.fillStyle(0x3e4f4b, 1);
    graphics.fillRect(x + 13, y + height - 4, 10, 12);
    graphics.fillRect(x + width - 23, y + height - 4, 10, 12);
  }

  private drawBeanBag(graphics: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number) {
    graphics.fillStyle(0x7d677a, 1);
    graphics.fillEllipse(x + width / 2, y + height / 2 + 4, width, height - 8);
    graphics.fillStyle(0xb091aa, 1);
    graphics.fillEllipse(x + width / 2 - 5, y + height / 2 - 7, width - 26, height - 28);
    graphics.fillStyle(0xd7bdc7, 0.75);
    graphics.fillEllipse(x + width / 2 - 14, y + height / 2 - 12, width - 60, height - 44);
  }

  private drawProjectBoard(graphics: Phaser.GameObjects.Graphics) {
    graphics.fillStyle(0x3f4d45, 1);
    graphics.fillRoundedRect(1040, 260, 72, 130, 5);
    graphics.fillStyle(0xebdca8, 1);
    graphics.fillRect(1050, 280, 52, 18);
    graphics.fillRect(1050, 308, 45, 10);
    graphics.fillRect(1050, 330, 52, 10);
    graphics.fillStyle(0xe98561, 1);
    graphics.fillCircle(1055, 279, 4);
    this.add.text(1014, 244, '项目板', { color: '#633d3a', fontFamily: 'monospace', fontSize: '11px' });
  }

  private createPeople() {
    this.player = this.add.rectangle(292, 335, PLAYER_SIZE, PLAYER_SIZE, 0x67b7d1).setStrokeStyle(2, 0xfff5dc);
    this.playerLabel = this.add.text(292, 353, 'You', { color: '#fff4d8', fontFamily: 'monospace', fontSize: '12px' }).setOrigin(0.5, 0);
    this.add.text(292, 369, '慢慢来', { color: '#70484a', fontFamily: 'monospace', fontSize: '10px' }).setOrigin(0.5, 0);
    this.createPerson(850, 220, 0xd18ba5, 'Loopy', '调咖啡');
    this.createPerson(690, 500, 0x9ecc8b, 'Evan', '读报');
  }

  private createPerson(x: number, y: number, color: number, name: string, activity: string) {
    this.add.rectangle(x, y, PLAYER_SIZE, PLAYER_SIZE, color).setStrokeStyle(2, 0xfff5dc);
    this.add.text(x, y + 18, name, { color: '#fff4d8', fontFamily: 'monospace', fontSize: '12px' }).setOrigin(0.5, 0);
    this.add.text(x, y + 34, activity, { color: '#70484a', fontFamily: 'monospace', fontSize: '10px' }).setOrigin(0.5, 0);
  }

  private createInput() {
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is unavailable.');
    this.cursors = keyboard.createCursorKeys();
    this.wasd = { W: keyboard.addKey('W'), A: keyboard.addKey('A'), S: keyboard.addKey('S'), D: keyboard.addKey('D') };
    this.interactKey = keyboard.addKey('E');
  }

  private createHotspots() {
    for (const spot of this.focusSpots) {
      const point = this.focusCoordinates.get(spot.seatId)!;
      const hotspot = this.add.circle(point.x, point.y, 46, 0xffffff, 0).setInteractive({ useHandCursor: true });
      hotspot.on('pointerdown', () => {
        if (!this.isFocusing) this.useFocusSpot(spot);
      });
    }
    const board = this.add.rectangle(1076, 325, 100, 168, 0xffffff, 0).setInteractive({ useHandCursor: true });
    board.on('pointerdown', () => gameBridge.emit('tasks.open', undefined));
  }

  private addObstacle(x: number, y: number, width: number, height: number) {
    this.obstacles.push({ x, y, width, height });
  }

  private movePlayer(dx: number, dy: number) {
    const x = PhaserMath.Clamp(this.player.x + dx, 146, WORLD_WIDTH - 88);
    const y = PhaserMath.Clamp(this.player.y + dy, 82, WORLD_HEIGHT - 88);
    if (this.collides(x, y)) return;
    this.player.setPosition(x, y);
    this.playerLabel.setPosition(x, y + 18);
  }

  private collides(x: number, y: number) {
    const padding = PLAYER_SIZE / 2;
    return this.obstacles.some((obstacle) => x + padding > obstacle.x && x - padding < obstacle.x + obstacle.width && y + padding > obstacle.y && y - padding < obstacle.y + obstacle.height);
  }

  private closestFocusSpot() {
    return this.focusSpots.find((spot) => {
      const point = this.focusCoordinates.get(spot.seatId)!;
      return Math.hypot(this.player.x - point.x, this.player.y - point.y) < 54;
    }) ?? null;
  }

  private isNearBoard() {
    return Math.hypot(this.player.x - 1035, this.player.y - 325) < 90;
  }

  private useFocusSpot(spot: FocusSpot) {
    const point = this.focusCoordinates.get(spot.seatId)!;
    this.occupiedSeatId = spot.seatId;
    this.player.setPosition(point.x, point.y);
    this.playerLabel.setPosition(point.x, point.y + 18);
    this.statusText.setText(`已坐在${spot.label}`);
    gameBridge.emit('focus.open', spot);
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
