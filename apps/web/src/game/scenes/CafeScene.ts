import { Input, Math as PhaserMath, Scene, Scenes } from 'phaser';
import { gameBridge, type FocusStarted, type FocusSpot } from '../bridge/GameBridge';
import { NpcSocket, type NpcWorldState } from '../realtime/npcSocket';

type Obstacle = { x: number; y: number; width: number; height: number };
type NpcVisual = {
  body: Phaser.GameObjects.Rectangle;
  name: Phaser.GameObjects.Text;
  activity: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
};

const WORLD_WIDTH = 2400;
const WORLD_HEIGHT = 1800;
const CAFE_WIDTH = 1200;
const CAFE_HEIGHT = 820;
const CAFE_X = 600;
const CAFE_Y = 600;
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
    { seatId: 'window-two-01-north', label: '西窗双人桌靠窗椅' },
    { seatId: 'window-two-01-south', label: '西窗双人桌朝内椅' },
    { seatId: 'window-four-01-north-west', label: '西窗四人桌靠窗椅' },
    { seatId: 'window-four-01-north-east', label: '西窗四人桌靠窗椅' },
    { seatId: 'window-four-01-south-west', label: '西窗四人桌朝内椅' },
    { seatId: 'window-four-01-south-east', label: '西窗四人桌朝内椅' },
    { seatId: 'window-two-02-north', label: '西窗双人桌靠窗椅' },
    { seatId: 'window-two-02-south', label: '西窗双人桌朝内椅' },
    ...['340', '410', '480', '550'].flatMap((y) => [
      { seatId: `community-left-${y}`, label: '中央多人桌左侧椅' },
      { seatId: `community-right-${y}`, label: '中央多人桌右侧椅' },
    ]),
    { seatId: 'fireplace-chair-01', label: '壁炉单人沙发' },
    { seatId: 'fireplace-chair-02', label: '壁炉阅读沙发' },
    { seatId: 'fireplace-beanbag-01', label: '壁炉懒人沙发' },
  ];
  private focusCoordinates = new Map<string, { x: number; y: number }>([
    ['window-two-01-north', { x: 295, y: 267 }], ['window-two-01-south', { x: 295, y: 338 }],
    ['window-four-01-north-west', { x: 270, y: 407 }], ['window-four-01-north-east', { x: 362, y: 407 }],
    ['window-four-01-south-west', { x: 270, y: 488 }], ['window-four-01-south-east', { x: 362, y: 488 }],
    ['window-two-02-north', { x: 295, y: 567 }], ['window-two-02-south', { x: 295, y: 638 }],
    ['community-left-340', { x: 485, y: 340 }], ['community-right-340', { x: 635, y: 340 }],
    ['community-left-410', { x: 485, y: 410 }], ['community-right-410', { x: 635, y: 410 }],
    ['community-left-480', { x: 485, y: 480 }], ['community-right-480', { x: 635, y: 480 }],
    ['community-left-550', { x: 485, y: 550 }], ['community-right-550', { x: 635, y: 550 }],
    ['fireplace-chair-01', { x: 872, y: 528 }], ['fireplace-chair-02', { x: 872, y: 668 }],
    ['fireplace-beanbag-01', { x: 1047, y: 704 }],
  ]);
  private exitCoordinates = new Map<string, { x: number; y: number }>([
    ['window-two-01-north', { x: 295, y: 245 }], ['window-two-01-south', { x: 295, y: 360 }],
    ['window-four-01-north-west', { x: 250, y: 385 }], ['window-four-01-north-east', { x: 382, y: 385 }],
    ['window-four-01-south-west', { x: 250, y: 510 }], ['window-four-01-south-east', { x: 382, y: 510 }],
    ['window-two-02-north', { x: 295, y: 545 }], ['window-two-02-south', { x: 295, y: 660 }],
    ['community-left-340', { x: 455, y: 340 }], ['community-right-340', { x: 665, y: 340 }],
    ['community-left-410', { x: 455, y: 410 }], ['community-right-410', { x: 665, y: 410 }],
    ['community-left-480', { x: 455, y: 480 }], ['community-right-480', { x: 665, y: 480 }],
    ['community-left-550', { x: 455, y: 550 }], ['community-right-550', { x: 665, y: 550 }],
    ['fireplace-chair-01', { x: 780, y: 528 }], ['fireplace-chair-02', { x: 780, y: 668 }],
    ['fireplace-beanbag-01', { x: 950, y: 704 }],
  ]);
  private obstacles: Obstacle[] = [];
  private occupiedSeatId: string | null = null;
  private isSitting = false;
  private isFocusing = false;
  private worldTimeMode = '';
  private isCameraDragging = false;
  private dragStart?: { x: number; y: number; scrollX: number; scrollY: number };
  private lastCameraDragAt = 0;
  private unsubscribeFocus?: () => void;
  private unsubscribeLeave?: () => void;
  private unsubscribeStopped?: () => void;
  private npcSocket?: NpcSocket;
  private npcVisuals = new Map<string, NpcVisual>();
  private npcSpeechBubbles = new Map<string, Phaser.GameObjects.Text>();
  private npcOccupiedSeats = new Set<string>();
  private npcPositionReportAt = 0;
  private unsubscribeNpcSend?: () => void;

  constructor() {
    super('CafeScene');
  }

  create() {
    try {
      this.worldTimeMode = this.getWorldTimeMode();
      this.drawOutdoors();
      const cafeChildStart = this.children.list.length;
      this.drawCafe();
      this.createPeople();
      this.createInput();
      this.createHotspots();
      this.placeCafeInWorld(cafeChildStart);
      this.setupCamera();
      this.connectNpcs();
      this.unsubscribeFocus = gameBridge.on('focus.started', (focus) => this.startFocus(focus));
      this.unsubscribeLeave = gameBridge.on('focus.leave', () => this.leaveSeat());
      this.unsubscribeStopped = gameBridge.on('focus.stopped', () => this.stopFocus());
      this.events.once(Scenes.Events.SHUTDOWN, this.cleanUp, this);
      this.time.addEvent({
        delay: 60_000,
        loop: true,
        callback: () => {
          if (this.getWorldTimeMode() !== this.worldTimeMode) this.scene.restart();
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown scene setup error';
      gameBridge.emit('game.error', { message });
      throw error;
    }
  }

  update(_: number, delta: number) {
    this.updateNpcVisuals(delta);
    if (this.time.now - this.npcPositionReportAt > 2000) {
      this.npcSocket?.sendPlayerPosition(this.player.x, this.player.y);
      this.npcPositionReportAt = this.time.now;
    }
    if (this.isFocusing) return;

    const speed = 0.16 * delta;
    let dx = 0;
    let dy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) dx -= speed;
    if (this.cursors.right.isDown || this.wasd.D.isDown) dx += speed;
    if (this.cursors.up.isDown || this.wasd.W.isDown) dy -= speed;
    if (this.cursors.down.isDown || this.wasd.S.isDown) dy += speed;
    const isMoving = dx !== 0 || dy !== 0;
    const interactPressed = Input.Keyboard.JustDown(this.interactKey);
    if (this.isSitting && (isMoving || interactPressed)) {
      this.leaveSeat();
      if (!isMoving) return;
    }
    if (dx || dy) {
      const length = Math.hypot(dx, dy);
      this.movePlayer((dx / length) * speed, (dy / length) * speed);
    }

    const closest = this.closestFocusSpot();
    const boardNearby = this.isNearBoard();
    this.hintText.setText(
      this.isSitting ? '按方向键 / E 离开座位' : boardNearby ? '按 E 打开右墙项目板' : closest ? `按 E 坐到${closest.label}` : '方向键 / WASD 移动 · 点击桌子或项目板',
    );
    if (interactPressed) {
      if (boardNearby) gameBridge.emit('tasks.open', undefined);
      else if (closest) this.useFocusSpot(closest);
    }
  }

  private drawCafe() {
    const graphics = this.add.graphics();
    const hour = new Date().getHours();
    const daylight = hour >= 7 && hour < 18;
    const phase = daylight ? hour < 11 ? '早晨' : hour < 16 ? '午后' : '傍晚' : '夜晚';

    this.cameras.main.setBackgroundColor(daylight ? '#83b2c1' : '#182237');
    graphics.fillStyle(daylight ? 0x62787a : 0x263246, 1);
    graphics.fillRect(0, 0, 104, CAFE_HEIGHT);
    graphics.fillStyle(daylight ? 0xb9aa91 : 0x4b5160, 1);
    graphics.fillRect(86, 0, 12, CAFE_HEIGHT);
    graphics.fillStyle(daylight ? 0xdfd0ac : 0x677083, 1);
    graphics.fillRect(99, 0, 5, CAFE_HEIGHT);
    graphics.lineStyle(1, daylight ? 0x8e9b99 : 0x40516a, 0.9);
    for (let y = 0; y < CAFE_HEIGHT; y += 22) {
      graphics.lineBetween(7, y, 83, y);
      if ((y / 22) % 2 === 0) graphics.lineBetween(45, y, 45, y + 22);
    }
    graphics.lineStyle(2, daylight ? 0xefdaaa : 0x5b6272, 0.85);
    for (let y = 10; y < CAFE_HEIGHT; y += 56) graphics.lineBetween(48, y, 48, y + 25);
    this.drawPlaneTree(graphics, 34, 166, daylight);
    this.drawPlaneTree(graphics, 62, 430, daylight);
    this.drawPlaneTree(graphics, 33, 700, daylight);
    this.add.text(10, 48, 'RUE\nDES\nRÊVES', { color: '#edf0df', fontFamily: 'monospace', fontSize: '9px', lineSpacing: 2, letterSpacing: 1 });

    graphics.fillStyle(0x332728, 1);
    graphics.fillRoundedRect(104, 35, CAFE_WIDTH - 144, 750, 10);
    graphics.fillStyle(0xc78762, 1);
    graphics.fillRect(134, 65, CAFE_WIDTH - 200, 690);
    graphics.lineStyle(1, 0x9d614e, 0.62);
    for (let x = 134; x < 1135; x += 35) graphics.lineBetween(x, 65, x, 755);
    for (let y = 65; y < 756; y += 35) graphics.lineBetween(134, y, 1134, y);

    this.drawNorthBar(graphics);
    this.drawWestWindows(graphics, daylight, hour);
    this.drawEntrance(graphics);
    this.drawCommunityTable(graphics);
    this.drawWindowTables(graphics);
    this.drawFireplaceAndSofas(graphics, !daylight);
    this.drawProjectBoard(graphics);

    this.add.text(188, 90, 'DREAM CAFE', { color: '#fff0ce', fontFamily: 'Georgia, serif', fontSize: '21px', fontStyle: 'bold', letterSpacing: 2 });
    this.add.text(188, 116, `西窗朝街 · ${phase} · ${daylight ? '窗边日光' : '壁炉时间'}`, { color: '#653e3c', fontFamily: 'monospace', fontSize: '12px' });
    this.statusText = this.add.text(188, 720, '漫游中', { color: '#623e3c', fontFamily: 'monospace', fontSize: '13px' });
    this.hintText = this.add.text(650, 720, '方向键 / WASD 移动 · 点击桌子或项目板', { color: '#623e3c', fontFamily: 'monospace', fontSize: '13px' }).setOrigin(0.5, 0);

    this.addObstacle(700, 100, 80, 220);
    this.addObstacle(700, 250, 300, 70);
    this.addObstacle(500, 300, 120, 300);
    this.addObstacle(1018, 490, 88, 130);
    this.addObstacle(820, 490, 105, 76);
    this.addObstacle(820, 630, 105, 76);
    this.addObstacle(990, 665, 115, 78);
    this.addObstacle(1042, 318, 60, 126);
    this.addObstacle(250, 275, 90, 54);
    this.addObstacle(250, 415, 132, 64);
    this.addObstacle(250, 575, 90, 54);
  }

  private drawOutdoors() {
    const graphics = this.add.graphics();
    const daylight = this.getWorldTimeMode() !== 'night';

    this.cameras.main.setBackgroundColor(daylight ? '#83b2c1' : '#182237');
    graphics.fillStyle(daylight ? 0x82b5c3 : 0x1d2a40, 1);
    graphics.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    graphics.fillStyle(daylight ? 0x78928f : 0x344653, 1);
    graphics.fillRect(0, 300, WORLD_WIDTH, 215);
    graphics.fillStyle(daylight ? 0xdacb9e : 0x697185, 1);
    graphics.fillRect(0, 515, WORLD_WIDTH, 62);
    graphics.fillStyle(daylight ? 0xe8d9b4 : 0x7e8491, 1);
    graphics.fillRect(0, 577, WORLD_WIDTH, 18);
    graphics.lineStyle(3, daylight ? 0xf4df9f : 0x8d91a0, 0.85);
    for (let x = 25; x < WORLD_WIDTH; x += 96) graphics.lineBetween(x, 406, x + 46, 406);

    graphics.fillStyle(daylight ? 0x638472 : 0x294a4a, 1);
    graphics.fillRect(0, 595, WORLD_WIDTH, WORLD_HEIGHT - 595);
    graphics.fillStyle(daylight ? 0x99ad72 : 0x465f58, 1);
    graphics.fillRect(0, 274, WORLD_WIDTH, 26);
    graphics.lineStyle(1, daylight ? 0xa28c68 : 0x43525b, 0.35);
    for (let x = 0; x <= WORLD_WIDTH; x += 40) graphics.lineBetween(x, 595, x, WORLD_HEIGHT);
    for (let y = 595; y <= WORLD_HEIGHT; y += 40) graphics.lineBetween(0, y, WORLD_WIDTH, y);

    this.drawPlaneTree(graphics, 165, 260, daylight);
    this.drawPlaneTree(graphics, 430, 258, daylight);
    this.drawPlaneTree(graphics, 1880, 260, daylight);
    this.drawPlaneTree(graphics, 2180, 258, daylight);
    this.drawPlaneTree(graphics, 230, 1630, daylight);
    this.drawPlaneTree(graphics, 510, 1680, daylight);
    this.drawPlaneTree(graphics, 1940, 1660, daylight);
    this.drawPlaneTree(graphics, 2200, 1640, daylight);
    this.add.text(70, 630, 'RUE DES RÊVES', { color: daylight ? '#e9e3c9' : '#aeb9bc', fontFamily: 'monospace', fontSize: '15px', letterSpacing: 3 });
    this.add.text(70, 657, '沿着法式梧桐街，走进 Dream Cafe', { color: daylight ? '#dce8df' : '#a6b2bb', fontFamily: 'monospace', fontSize: '12px' });
  }

  private placeCafeInWorld(cafeChildStart: number) {
    this.children.list.slice(cafeChildStart).forEach((child) => {
      const position = child as Phaser.GameObjects.GameObject & { x?: number; y?: number };
      if (typeof position.x === 'number') position.x += CAFE_X;
      if (typeof position.y === 'number') position.y += CAFE_Y;
    });
    this.offsetCoordinates(this.focusCoordinates);
    this.offsetCoordinates(this.exitCoordinates);
    this.obstacles = this.obstacles.map((obstacle) => ({ ...obstacle, x: obstacle.x + CAFE_X, y: obstacle.y + CAFE_Y }));
    this.npcVisuals.forEach((visual) => {
      visual.targetX += CAFE_X;
      visual.targetY += CAFE_Y;
    });
  }

  private offsetCoordinates(coordinates: Map<string, { x: number; y: number }>) {
    coordinates.forEach((point, seatId) => coordinates.set(seatId, { x: point.x + CAFE_X, y: point.y + CAFE_Y }));
  }

  private setupCamera() {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.lockCameraToCafe();

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.dragStart = { x: pointer.x, y: pointer.y, scrollX: camera.scrollX, scrollY: camera.scrollY };
      this.isCameraDragging = false;
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || !this.dragStart) return;
      if (this.isInCafe(this.player.x, this.player.y)) return;
      const dx = pointer.x - this.dragStart.x;
      const dy = pointer.y - this.dragStart.y;
      if (!this.isCameraDragging && Math.hypot(dx, dy) > 6) {
        this.isCameraDragging = true;
        camera.stopFollow();
      }
      if (!this.isCameraDragging) return;
      const maxX = Math.max(0, WORLD_WIDTH - camera.width / camera.zoom);
      const maxY = Math.max(0, WORLD_HEIGHT - camera.height / camera.zoom);
      camera.setScroll(PhaserMath.Clamp(this.dragStart.scrollX - dx / camera.zoom, 0, maxX), PhaserMath.Clamp(this.dragStart.scrollY - dy / camera.zoom, 0, maxY));
    });
    const finishDrag = () => {
      if (this.isCameraDragging) this.lastCameraDragAt = this.time.now;
      this.dragStart = undefined;
      this.isCameraDragging = false;
    };
    this.input.on('pointerup', finishDrag);
    this.input.on('pointerupoutside', finishDrag);
  }

  private lockCameraToCafe() {
    const camera = this.cameras.main;
    camera.stopFollow();
    camera.centerOn(CAFE_X + CAFE_WIDTH / 2, CAFE_Y + CAFE_HEIGHT / 2);
  }

  private isInCafe(x: number, y: number) {
    return x >= CAFE_X + 104 && x <= CAFE_X + CAFE_WIDTH - 40 && y >= CAFE_Y + 35 && y <= CAFE_Y + CAFE_HEIGHT - 35;
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
    graphics.fillRoundedRect(700, 100, 80, 220, 8);
    graphics.fillRoundedRect(700, 250, 300, 70, 8);
    graphics.fillStyle(0x82564e, 1);
    graphics.fillRect(720, 120, 20, 180);
    graphics.fillRect(718, 268, 264, 20);
    graphics.fillStyle(0xf3be69, 1);
    graphics.fillCircle(820, 298, 11);
    graphics.fillCircle(890, 298, 11);
    graphics.fillStyle(0x263945, 1);
    graphics.fillRect(904, 268, 62, 34);
    graphics.fillStyle(0xd9d3c4, 1);
    graphics.fillCircle(936, 285, 12);
    graphics.fillCircle(750, 210, 10);
    this.add.text(800, 278, 'COFFEE BAR', { color: '#fff0ce', fontFamily: 'monospace', fontSize: '13px', letterSpacing: 1 });
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
    graphics.fillRoundedRect(500, 300, 120, 300, 8);
    for (let y = 340; y < 580; y += 70) {
      graphics.fillStyle(0x49333a, 1);
      graphics.fillCircle(485, y, 13);
      graphics.fillCircle(635, y, 13);
    }
  }

  private drawWindowTables(graphics: Phaser.GameObjects.Graphics) {
    this.drawTable(graphics, 250, 275, 90, 54, '2');
    this.drawTable(graphics, 250, 415, 132, 64, '4');
    this.drawTable(graphics, 250, 575, 90, 54, '2');
  }

  private drawTable(graphics: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number, capacity: string) {
    graphics.fillStyle(0x71483f, 1);
    graphics.fillRoundedRect(x, y, width, height, 6);
    graphics.fillStyle(0x4a3339, 1);
    if (capacity === '2') {
      graphics.fillCircle(x + width / 2, y - 8, 12);
      graphics.fillCircle(x + width / 2, y + height + 9, 12);
    } else {
      graphics.fillCircle(x + 20, y + height + 9, 12);
      graphics.fillCircle(x + width - 20, y + height + 9, 12);
      graphics.fillCircle(x + 20, y - 8, 12);
      graphics.fillCircle(x + width - 20, y - 8, 12);
    }
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
    this.drawArmchair(graphics, 820, 490, 105, 76);
    this.drawArmchair(graphics, 820, 630, 105, 76);
    this.drawBeanBag(graphics, 990, 665, 115, 78);
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
  }

  private createPerson(npcId: string, x: number, y: number, color: number, name: string, activity: string) {
    const body = this.add.rectangle(x, y, PLAYER_SIZE, PLAYER_SIZE, color).setStrokeStyle(2, 0xfff5dc);
    const nameText = this.add.text(x, y + 18, name, { color: '#fff4d8', fontFamily: 'monospace', fontSize: '12px' }).setOrigin(0.5, 0);
    const activityText = this.add.text(x, y + 34, activity, { color: '#70484a', fontFamily: 'monospace', fontSize: '10px' }).setOrigin(0.5, 0);
    this.npcVisuals.set(npcId, { body, name: nameText, activity: activityText, targetX: x, targetY: y });
  }

  private connectNpcs() {
    // Scene restarts (for example, when the visual time mode changes) must
    // never leave a second bridge listener or websocket alive.
    this.npcSocket?.close();
    this.unsubscribeNpcSend?.();
    this.npcSocket = new NpcSocket(
      (states) => this.applyNpcStates(states),
      (npcId, content, eventId) => this.showNpcSpeech(npcId, content, eventId),
    );
    // A desktop WebView can briefly reject a loopback WebSocket while the
    // bundled local service is still unpacking. The cafe itself remains
    // playable; NpcSocket will reconnect once the service is ready.
    try {
      this.npcSocket.connect();
    } catch {
      this.time.delayedCall(1_000, () => this.npcSocket?.connect());
    }
    this.unsubscribeNpcSend = gameBridge.on('npc.send', ({ content }) => this.npcSocket?.sendChat(content));
  }

  private applyNpcStates(states: NpcWorldState[]) {
    this.npcOccupiedSeats.clear();
    states.forEach((state) => {
      let visual = this.npcVisuals.get(state.actor_id);
      if (!visual) {
        this.createPerson(state.actor_id, state.x, state.y, state.color ?? 0xd18ba5, state.name ?? 'NPC', state.activity ?? '休息');
        visual = this.npcVisuals.get(state.actor_id);
      }
      if (!visual) return;
      visual.targetX = state.x;
      visual.targetY = state.y;
      visual.activity.setText(state.activity ?? (state.state === 'offstage' ? '外出中' : '休息'));
      const visible = state.visible ?? state.state !== 'offstage';
      visual.body.setVisible(visible);
      visual.name.setVisible(visible);
      visual.activity.setVisible(visible);
      if (visible && state.state === 'working') {
        const occupiedSpot = this.focusSpots.find((spot) => {
          const point = this.focusCoordinates.get(spot.seatId)!;
          return Math.hypot(point.x - state.x, point.y - state.y) < 26;
        });
        if (occupiedSpot) this.npcOccupiedSeats.add(occupiedSpot.seatId);
      }
    });
    gameBridge.emit('npc.states', states.map(({ actor_id, activity, visible }) => ({ npcId: actor_id, activity: activity ?? '休息', visible: visible ?? true })));
  }

  private updateNpcVisuals(delta: number) {
    const progress = Math.min(1, delta / 520);
    this.npcVisuals.forEach((visual, npcId) => {
      const x = PhaserMath.Linear(visual.body.x, visual.targetX, progress);
      const y = PhaserMath.Linear(visual.body.y, visual.targetY, progress);
      visual.body.setPosition(x, y);
      visual.name.setPosition(x, y + 18);
      visual.activity.setPosition(x, y + 34);
      const bubble = this.npcSpeechBubbles.get(npcId);
      bubble?.setPosition(x, y - 28);
    });
  }

  private showNpcSpeech(npcId: string, content: string, eventId?: string) {
    gameBridge.emit('npc.message', { npcId, content, eventId });
    const visual = this.npcVisuals.get(npcId);
    if (!visual) return;
    this.npcSpeechBubbles.get(npcId)?.destroy();
    const bubble = this.add.text(visual.body.x, visual.body.y - 28, content.slice(0, 220), {
      align: 'center',
      backgroundColor: '#fff1d0',
      color: '#493642',
      fontFamily: 'sans-serif',
      fontSize: '13px',
      padding: { x: 10, y: 7 },
      wordWrap: { width: 250, useAdvancedWrap: true },
    }).setDepth(20).setOrigin(0.5, 1);
    this.npcSpeechBubbles.set(npcId, bubble);
    this.tweens.add({
      targets: bubble,
      alpha: 0,
      delay: 5_500,
      duration: 450,
      onComplete: () => {
        if (this.npcSpeechBubbles.get(npcId) === bubble) this.npcSpeechBubbles.delete(npcId);
        bubble.destroy();
      },
    });
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
      hotspot.on('pointerup', () => {
        if (!this.isFocusing && !this.npcOccupiedSeats.has(spot.seatId) && this.time.now - this.lastCameraDragAt > 80) this.useFocusSpot(spot);
      });
    }
    const board = this.add.rectangle(1076, 325, 100, 168, 0xffffff, 0).setInteractive({ useHandCursor: true });
    board.on('pointerup', () => {
      if (this.time.now - this.lastCameraDragAt > 80) gameBridge.emit('tasks.open', undefined);
    });
  }

  private addObstacle(x: number, y: number, width: number, height: number) {
    this.obstacles.push({ x, y, width, height });
  }

  private movePlayer(dx: number, dy: number) {
    const x = PhaserMath.Clamp(this.player.x + dx, PLAYER_SIZE, WORLD_WIDTH - PLAYER_SIZE);
    const y = PhaserMath.Clamp(this.player.y + dy, PLAYER_SIZE, WORLD_HEIGHT - PLAYER_SIZE);
    if (this.collides(x, y)) return;
    this.player.setPosition(x, y);
    this.playerLabel.setPosition(x, y + 18);
    if (this.isInCafe(x, y)) this.lockCameraToCafe();
    else this.cameras.main.startFollow(this.player, true, 0.09, 0.09);
  }

  private collides(x: number, y: number) {
    const padding = PLAYER_SIZE / 2;
    if (!this.canCrossCafeWall(x, y)) return true;
    return this.obstacles.some((obstacle) => x + padding > obstacle.x && x - padding < obstacle.x + obstacle.width && y + padding > obstacle.y && y - padding < obstacle.y + obstacle.height);
  }

  private canCrossCafeWall(nextX: number, nextY: number) {
    const wasInside = this.isInCafe(this.player.x, this.player.y);
    const willBeInside = this.isInCafe(nextX, nextY);
    if (wasInside === willBeInside) return true;
    return this.isAtCafeDoor(this.player.x, this.player.y) || this.isAtCafeDoor(nextX, nextY);
  }

  private isAtCafeDoor(x: number, y: number) {
    const doorLeft = CAFE_X + 136 - PLAYER_SIZE;
    const doorRight = CAFE_X + 163 + PLAYER_SIZE;
    const doorTop = CAFE_Y + 132 - PLAYER_SIZE;
    const doorBottom = CAFE_Y + 220 + PLAYER_SIZE;
    return x >= doorLeft && x <= doorRight && y >= doorTop && y <= doorBottom;
  }

  private closestFocusSpot() {
    return this.focusSpots.find((spot) => {
      if (this.npcOccupiedSeats.has(spot.seatId)) return false;
      const point = this.focusCoordinates.get(spot.seatId)!;
      return Math.hypot(this.player.x - point.x, this.player.y - point.y) < 54;
    }) ?? null;
  }

  private isNearBoard() {
    return Math.hypot(this.player.x - (1035 + CAFE_X), this.player.y - (325 + CAFE_Y)) < 90;
  }

  private useFocusSpot(spot: FocusSpot) {
    const point = this.focusCoordinates.get(spot.seatId)!;
    this.occupiedSeatId = spot.seatId;
    this.isSitting = true;
    this.player.setPosition(point.x, point.y);
    this.playerLabel.setPosition(point.x, point.y + 18);
    this.lockCameraToCafe();
    this.statusText.setText(`已坐在${spot.label}`);
    gameBridge.emit('focus.open', spot);
  }

  private leaveSeat() {
    if (!this.isSitting || this.isFocusing) return;
    const exit = this.occupiedSeatId ? this.exitCoordinates.get(this.occupiedSeatId) : undefined;
    if (exit) {
      this.player.setPosition(exit.x, exit.y);
      this.playerLabel.setPosition(exit.x, exit.y + 18);
    }
    this.occupiedSeatId = null;
    this.isSitting = false;
    this.statusText.setText('已离开座位');
    gameBridge.emit('focus.closed', undefined);
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
    this.npcSocket?.close();
    this.npcSocket = undefined;
    this.unsubscribeNpcSend?.();
    this.unsubscribeNpcSend = undefined;
    this.unsubscribeFocus?.();
    this.unsubscribeLeave?.();
    this.unsubscribeStopped?.();
    this.npcSpeechBubbles.forEach((bubble) => bubble.destroy());
    this.npcSpeechBubbles.clear();
  }

  private getWorldTimeMode() {
    const hour = new Date().getHours();
    if (hour < 7 || hour >= 18) return 'night';
    if (hour < 11) return 'morning';
    if (hour < 16) return 'afternoon';
    return 'evening';
  }
}
