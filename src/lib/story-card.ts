import { formatPercent } from "@/lib/labels";

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

export type StoryCardData = {
  gameDayTitle: string;
  gameDayDate: string;
  location: string;
  name: string;
  nickname: string | null;
  photoUrl: string | null;
  played: number;
  won: number;
  winRate: number;
  goals: number;
  assists: number;
  topScorer: boolean;
};

const COLOR = {
  night950: "#060b10",
  night900: "#0b1219",
  night800: "#111a22",
  night700: "#17212b",
  pitch300: "#6ee7a8",
  pitch400: "#34d98a",
  pitch500: "#16b873",
  pitch600: "#0f9560",
  white: "#f8fafc",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/** Baixa a imagem como blob para desenhar no canvas sem correr risco de "sujar" a exportacao por CORS. */
async function loadImageSafe(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      return await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = objectUrl;
      });
    } finally {
      // A imagem ja decodificou o bitmap; o object URL pode ir embora.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    }
  } catch {
    return null;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Reduz o tamanho da fonte ate caber em maxWidth, sem passar de minSize. */
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  minSize: number,
  weight: string,
  family: string,
): number {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createLinearGradient(0, 0, 0, STORY_HEIGHT);
  bg.addColorStop(0, COLOR.night900);
  bg.addColorStop(1, COLOR.night950);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  const glow = ctx.createRadialGradient(
    STORY_WIDTH / 2,
    620,
    40,
    STORY_WIDTH / 2,
    620,
    620,
  );
  glow.addColorStop(0, "rgba(22, 184, 115, 0.28)");
  glow.addColorStop(1, "rgba(22, 184, 115, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  // Marcacao de campo, so decorativa, bem discreta.
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(STORY_WIDTH / 2, 620, 420, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeRect(90, 90, STORY_WIDTH - 180, STORY_HEIGHT - 180);
  ctx.restore();
}

function drawHeader(ctx: CanvasRenderingContext2D, data: StoryCardData) {
  ctx.save();
  ctx.textBaseline = "middle";

  // Selo da marca.
  roundRect(ctx, 90, 84, 64, 64, 18);
  ctx.fillStyle = COLOR.night800;
  ctx.fill();
  ctx.strokeStyle = "rgba(22, 184, 115, 0.5)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = "34px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = COLOR.pitch400;
  ctx.fillText("⚽", 90 + 32, 84 + 35);

  ctx.textAlign = "left";
  ctx.font = "700 38px system-ui, sans-serif";
  ctx.fillStyle = COLOR.white;
  ctx.fillText("VoaCraque", 172, 108);
  ctx.font = "500 24px system-ui, sans-serif";
  ctx.fillStyle = COLOR.slate500;
  ctx.fillText("Resumo da pelada", 172, 142);

  ctx.textAlign = "right";
  ctx.font = "500 26px system-ui, sans-serif";
  ctx.fillStyle = COLOR.slate400;
  ctx.fillText(data.gameDayDate, STORY_WIDTH - 90, 116);
  ctx.restore();
}

function drawTitle(ctx: CanvasRenderingContext2D, data: StoryCardData) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const maxWidth = STORY_WIDTH - 220;
  const titleSize = fitFontSize(ctx, data.gameDayTitle, maxWidth, 46, 30, "700", "system-ui, sans-serif");
  ctx.font = `700 ${titleSize}px system-ui, sans-serif`;
  ctx.fillStyle = COLOR.slate200;
  ctx.fillText(data.gameDayTitle, STORY_WIDTH / 2, 248, maxWidth);

  ctx.font = "500 30px system-ui, sans-serif";
  ctx.fillStyle = COLOR.slate400;
  ctx.fillText(`📍 ${data.location}`, STORY_WIDTH / 2, 300, maxWidth);
  ctx.restore();
}

function drawAvatar(ctx: CanvasRenderingContext2D, image: HTMLImageElement | null, data: StoryCardData) {
  const cx = STORY_WIDTH / 2;
  const cy = 600;
  const radius = 168;

  ctx.save();
  const ring = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  ring.addColorStop(0, COLOR.pitch300);
  ring.addColorStop(1, COLOR.pitch600);
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 10, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.save();
  ctx.clip();
  if (image) {
    const size = Math.min(image.width, image.height);
    const sx = (image.width - size) / 2;
    const sy = (image.height - size) / 2;
    ctx.drawImage(image, sx, sy, size, size, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    ctx.fillStyle = COLOR.night700;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.fillStyle = COLOR.slate300;
    ctx.font = "700 120px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initialsOf(data.name), cx, cy + 8);
  }
  ctx.restore();
  ctx.restore();

  if (data.topScorer) {
    drawTopScorerPatch(ctx, cx + radius * 0.62, cy + radius * 0.68);
  }
}

function drawTopScorerPatch(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-7 * Math.PI) / 180);

  const w = 300;
  const h = 84;
  const gradient = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  gradient.addColorStop(0, "#f59e0b");
  gradient.addColorStop(1, "#ef4444");

  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 2;
  roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 34px system-ui, sans-serif";
  ctx.fillStyle = "#fff8ec";
  ctx.fillText("🔥 ARTILHEIRO", 6, 2);
  ctx.restore();
}

function drawName(ctx: CanvasRenderingContext2D, data: StoryCardData) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const maxWidth = STORY_WIDTH - 140;
  const nameSize = fitFontSize(ctx, data.name, maxWidth, 68, 40, "800", "system-ui, sans-serif");
  ctx.font = `800 ${nameSize}px system-ui, sans-serif`;
  ctx.fillStyle = COLOR.white;
  ctx.fillText(data.name, STORY_WIDTH / 2, 848, maxWidth);

  if (data.nickname) {
    const nickname = `"${data.nickname}"`;
    ctx.font = "italic 500 38px system-ui, sans-serif";
    ctx.fillStyle = COLOR.pitch300;
    ctx.fillText(nickname, STORY_WIDTH / 2, 906, maxWidth);
  }
  ctx.restore();
}

function drawHeadlineStat(ctx: CanvasRenderingContext2D, data: StoryCardData) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const label = data.played > 0 ? formatPercent(data.winRate) : "—";
  ctx.font = "800 148px system-ui, sans-serif";
  ctx.fillStyle = COLOR.pitch400;
  ctx.fillText(label, STORY_WIDTH / 2, 1080);

  ctx.font = "700 30px system-ui, sans-serif";
  ctx.fillStyle = COLOR.slate400;
  ctx.letterSpacing = "4px";
  ctx.fillText("APROVEITAMENTO NA PELADA", STORY_WIDTH / 2, 1156);
  ctx.letterSpacing = "0px";
  ctx.restore();
}

type StatTile = { emoji: string; value: number; label: string };

function drawStatsGrid(ctx: CanvasRenderingContext2D, data: StoryCardData) {
  const tiles: StatTile[] = [
    { emoji: "📅", value: data.played, label: "PARTIDAS" },
    { emoji: "🏆", value: data.won, label: "VITÓRIAS" },
    { emoji: "⚽", value: data.goals, label: "GOLS" },
    { emoji: "🤝", value: data.assists, label: "ASSISTÊNCIAS" },
  ];

  const gap = 24;
  const cols = 2;
  const gridWidth = STORY_WIDTH - 180;
  const tileWidth = (gridWidth - gap) / cols;
  const tileHeight = 220;
  const startX = 90;
  const startY = 1230;

  tiles.forEach((tile, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = startX + col * (tileWidth + gap);
    const y = startY + row * (tileHeight + gap);

    ctx.save();
    roundRect(ctx, x, y, tileWidth, tileHeight, 28);
    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, tileWidth, tileHeight, 28);
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "44px system-ui, sans-serif";
    ctx.fillText(tile.emoji, x + tileWidth / 2, y + 56);

    ctx.font = "800 72px system-ui, sans-serif";
    ctx.fillStyle = COLOR.white;
    ctx.fillText(String(tile.value), x + tileWidth / 2, y + 130);

    ctx.font = "700 24px system-ui, sans-serif";
    ctx.fillStyle = COLOR.slate400;
    ctx.letterSpacing = "2px";
    ctx.fillText(tile.label, x + tileWidth / 2, y + 178);
    ctx.letterSpacing = "0px";
    ctx.restore();
  });
}

function drawFooter(ctx: CanvasRenderingContext2D) {
  ctx.save();
  const barY = STORY_HEIGHT - 140;
  const barGradient = ctx.createLinearGradient(90, 0, STORY_WIDTH - 90, 0);
  barGradient.addColorStop(0, "rgba(22, 184, 115, 0)");
  barGradient.addColorStop(0.5, "rgba(22, 184, 115, 0.6)");
  barGradient.addColorStop(1, "rgba(22, 184, 115, 0)");
  ctx.fillStyle = barGradient;
  ctx.fillRect(90, barY, STORY_WIDTH - 180, 3);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "500 28px system-ui, sans-serif";
  ctx.fillStyle = COLOR.slate500;
  ctx.fillText("voacraque.app", STORY_WIDTH / 2, barY + 44);
  ctx.restore();
}

/** Desenha o card 9:16 inteiro no canvas informado (o canvas ja precisa existir no DOM). */
export async function drawStoryCard(canvas: HTMLCanvasElement, data: StoryCardData): Promise<void> {
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const image = await loadImageSafe(data.photoUrl);

  drawBackground(ctx);
  drawHeader(ctx, data);
  drawTitle(ctx, data);
  drawAvatar(ctx, image, data);
  drawName(ctx, data);
  drawHeadlineStat(ctx, data);
  drawStatsGrid(ctx, data);
  drawFooter(ctx);
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png", 0.95));
}
