import { pickBadges, pickHeadline, type StoryBadge } from "@/lib/story-summary";

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

/**
 * O Instagram cobre ~250px do topo (perfil, barra de progresso) e do rodape
 * (caixa de resposta). Tudo que importa fica entre SAFE_TOP e SAFE_BOTTOM; fora
 * disso so fundo e a assinatura do site.
 */
export const SAFE_TOP = 250;
export const SAFE_BOTTOM = 1670;

const MARGIN = 90;
const SYSTEM_FONT = "system-ui, sans-serif";

export type StoryCardData = {
  gameDayTitle: string;
  gameDayDate: string;
  location: string;
  name: string;
  nickname: string | null;
  photoUrl: string | null;
  played: number;
  won: number;
  lost: number;
  winRate: number;
  goals: number;
  assists: number;
  topScorer: boolean;
  mvp: boolean;
};

export type StoryCardOptions = {
  /** Familia da fonte condensada (next/font) ja declarada na pagina; sem ela, o cartao usa system-ui. */
  displayFamily?: string | null;
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

/*
 * Icones do lucide (https://lucide.dev, licenca ISC, ja e dependencia do
 * projeto: lucide-react 1.45). Copiados como caminhos SVG de 24x24 e
 * desenhados com Path2D, para o cartao nao depender de emoji (que muda de cara
 * em cada sistema). Circulos e retangulos do original viraram caminhos.
 */
const ICON = {
  pin: [
    "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
    "M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  ],
  calendar: [
    "M8 2v3",
    "M16 2v3",
    "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
    "M3 9h18",
    "M8 13h.01",
    "M12 13h.01",
    "M16 13h.01",
    "M8 17h.01",
    "M12 17h.01",
    "M16 17h.01",
  ],
  trophy: [
    "M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2",
    "M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2",
    "M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3",
    "M4 22h16",
    "M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z",
    "M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3",
  ],
  goal: [
    "M12 13V2l8 4-8 4",
    "M20.561 10.222a9 9 0 1 1-12.55-5.29",
    "M8.002 9.997a5 5 0 1 0 8.9 2.02",
  ],
  handshake: [
    "m11 17 2 2a1 1 0 1 0 3-3",
    "m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4",
    "m21 3 1 11h-2",
    "M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3",
    "M3 4h8",
  ],
  flame: [
    "M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4",
  ],
  crown: [
    "M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z",
    "M5 21h14",
  ],
  shield: [
    "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
  ],
} as const;

type IconName = keyof typeof ICON;

function drawIcon(
  ctx: CanvasRenderingContext2D,
  name: IconName,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const shape of ICON[name]) ctx.stroke(new Path2D(shape));
  ctx.restore();
}

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

/**
 * Espera a fonte condensada carregar (ate `timeoutMs`) antes de desenhar: no
 * canvas, fonte que ainda nao baixou sai como fallback sem avisar. Se nao
 * carregar a tempo, o cartao sai com a fonte do sistema. So a familia
 * principal conta: a face de fallback que o next/font acrescenta na lista
 * (local(Arial)) falha em sistemas sem Arial e derrubaria a checagem inteira.
 */
export async function resolveDisplayFamily(
  family: string | null | undefined,
  timeoutMs = 1500,
): Promise<string> {
  if (!family || typeof document === "undefined" || !document.fonts) return SYSTEM_FONT;
  const primary = family.split(",")[0].trim();
  try {
    await Promise.race([
      Promise.all([document.fonts.load(`800 64px ${primary}`), document.fonts.load(`600 64px ${primary}`)]),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
    const ready = document.fonts.check(`800 64px ${primary}`) && document.fonts.check(`600 64px ${primary}`);
    return ready ? `${primary}, ${SYSTEM_FONT}` : SYSTEM_FONT;
  } catch {
    return SYSTEM_FONT;
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

/** Texto centralizado com espacamento entre letras (o espacamento tambem entra depois da ultima letra). */
function fillCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  tracking = 0,
  maxWidth?: number,
) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = `${tracking}px`;
  ctx.fillText(text, cx + tracking / 2, cy, maxWidth);
  ctx.restore();
}

function measureTracked(ctx: CanvasRenderingContext2D, text: string, tracking: number): number {
  ctx.save();
  ctx.letterSpacing = `${tracking}px`;
  const width = ctx.measureText(text).width;
  ctx.restore();
  return width;
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createLinearGradient(0, 0, 0, STORY_HEIGHT);
  bg.addColorStop(0, COLOR.night900);
  bg.addColorStop(1, COLOR.night950);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  // Faixas alternadas, bem discretas: lembram gramado cortado.
  ctx.fillStyle = "rgba(22, 184, 115, 0.035)";
  for (let x = 0; x < STORY_WIDTH; x += 240) ctx.fillRect(x, 0, 120, STORY_HEIGHT);

  const glow = ctx.createRadialGradient(STORY_WIDTH / 2, 700, 40, STORY_WIDTH / 2, 700, 640);
  glow.addColorStop(0, "rgba(22, 184, 115, 0.28)");
  glow.addColorStop(1, "rgba(22, 184, 115, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
}

function drawBrandRow(
  ctx: CanvasRenderingContext2D,
  data: StoryCardData,
  logo: HTMLImageElement | null,
  display: string,
) {
  const cy = 288;
  let textX = MARGIN;
  if (logo) {
    ctx.drawImage(logo, MARGIN, cy - 28, 56, 56);
    textX += 56 + 18;
  }

  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = `800 38px ${display}`;
  ctx.fillStyle = COLOR.white;
  ctx.letterSpacing = "6px";
  ctx.fillText("VOA CRAQUE", textX, cy);

  ctx.textAlign = "right";
  ctx.letterSpacing = "0px";
  ctx.font = `500 28px ${SYSTEM_FONT}`;
  ctx.fillStyle = COLOR.slate400;
  ctx.fillText(data.gameDayDate, STORY_WIDTH - MARGIN, cy);
  ctx.restore();
}

function drawTitleAndPlace(ctx: CanvasRenderingContext2D, data: StoryCardData, display: string) {
  const maxWidth = STORY_WIDTH - 2 * MARGIN;
  const title = data.gameDayTitle.toUpperCase();
  const titleSize = fitFontSize(ctx, title, maxWidth, 60, 32, "800", display);
  ctx.font = `800 ${titleSize}px ${display}`;
  ctx.fillStyle = COLOR.slate200;
  fillCentered(ctx, title, STORY_WIDTH / 2, 372, 2, maxWidth);

  // Pino desenhado + local, centralizados como um grupo so.
  ctx.font = `500 30px ${SYSTEM_FONT}`;
  const maxPlaceWidth = maxWidth - 50;
  const placeWidth = Math.min(ctx.measureText(data.location).width, maxPlaceWidth);
  const groupWidth = 34 + 10 + placeWidth;
  const startX = (STORY_WIDTH - groupWidth) / 2;
  drawIcon(ctx, "pin", startX, 411, 34, COLOR.slate400);
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = COLOR.slate400;
  ctx.fillText(data.location, startX + 44, 429, maxPlaceWidth);
  ctx.restore();
}

const PHOTO_SIZE = 400;
const PHOTO_X = (STORY_WIDTH - PHOTO_SIZE) / 2;
const PHOTO_Y = 476;

function drawPhoto(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  data: StoryCardData,
  display: string,
) {
  const radius = 48;
  const border = 8;

  ctx.save();
  const ring = ctx.createLinearGradient(PHOTO_X, PHOTO_Y, PHOTO_X + PHOTO_SIZE, PHOTO_Y + PHOTO_SIZE);
  ring.addColorStop(0, COLOR.pitch300);
  ring.addColorStop(1, COLOR.pitch600);
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  roundRect(ctx, PHOTO_X - border, PHOTO_Y - border, PHOTO_SIZE + 2 * border, PHOTO_SIZE + 2 * border, radius + border);
  ctx.fillStyle = ring;
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, PHOTO_X, PHOTO_Y, PHOTO_SIZE, PHOTO_SIZE, radius);
  ctx.clip();
  if (image) {
    const size = Math.min(image.width, image.height);
    const sx = (image.width - size) / 2;
    const sy = (image.height - size) / 2;
    ctx.drawImage(image, sx, sy, size, size, PHOTO_X, PHOTO_Y, PHOTO_SIZE, PHOTO_SIZE);
  } else {
    ctx.fillStyle = COLOR.night700;
    ctx.fillRect(PHOTO_X, PHOTO_Y, PHOTO_SIZE, PHOTO_SIZE);
    ctx.fillStyle = COLOR.slate300;
    ctx.font = `800 190px ${display}`;
    fillCentered(ctx, initialsOf(data.name), STORY_WIDTH / 2, PHOTO_Y + PHOTO_SIZE / 2 + 8, 4);
  }
  ctx.restore();
}

const BADGE_STYLE: Record<
  StoryBadge,
  { label: string; icon: IconName; from: string; to: string; ink: string; outline: boolean }
> = {
  MVP: { label: "MVP", icon: "crown", from: COLOR.pitch300, to: COLOR.pitch500, ink: COLOR.night950, outline: false },
  TOP_SCORER: {
    label: "ARTILHEIRO",
    icon: "flame",
    from: "#f59e0b",
    to: "#ef4444",
    ink: "#fff8ec",
    outline: false,
  },
  UNBEATEN: {
    label: "INVICTO",
    icon: "shield",
    from: COLOR.night700,
    to: COLOR.night700,
    ink: COLOR.slate200,
    outline: true,
  },
};

/** Selos lado a lado, centralizados, sobrepondo a base da foto. */
function drawBadges(ctx: CanvasRenderingContext2D, badges: StoryBadge[], display: string) {
  if (badges.length === 0) return;
  const height = 64;
  const gap = 16;
  const padding = 26;
  const iconSize = 30;
  const tracking = 3;
  const cy = PHOTO_Y + PHOTO_SIZE + 4;

  ctx.font = `800 30px ${display}`;
  const widths = badges.map(
    (badge) => padding * 2 + iconSize + 12 + measureTracked(ctx, BADGE_STYLE[badge].label, tracking),
  );
  const total = widths.reduce((sum, width) => sum + width, 0) + gap * (badges.length - 1);
  let x = (STORY_WIDTH - total) / 2;

  badges.forEach((badge, index) => {
    const style = BADGE_STYLE[badge];
    const width = widths[index];
    const y = cy - height / 2;

    ctx.save();
    const fill = ctx.createLinearGradient(x, 0, x + width, 0);
    fill.addColorStop(0, style.from);
    fill.addColorStop(1, style.to);
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    roundRect(ctx, x, y, width, height, height / 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRect(ctx, x, y, width, height, height / 2);
    ctx.strokeStyle = style.outline ? "rgba(148, 163, 184, 0.55)" : "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    drawIcon(ctx, style.icon, x + padding, cy - iconSize / 2, iconSize, style.ink);
    ctx.save();
    ctx.font = `800 30px ${display}`;
    ctx.fillStyle = style.ink;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.letterSpacing = `${tracking}px`;
    ctx.fillText(style.label, x + padding + iconSize + 12, cy + 1);
    ctx.restore();

    x += width + gap;
  });
}

function drawNameBlock(ctx: CanvasRenderingContext2D, data: StoryCardData, display: string) {
  const maxWidth = STORY_WIDTH - 120;
  const name = data.name.toUpperCase();
  const size = fitFontSize(ctx, name, maxWidth, 112, 48, "800", display);
  ctx.font = `800 ${size}px ${display}`;
  ctx.fillStyle = COLOR.white;
  fillCentered(ctx, name, STORY_WIDTH / 2, 968, 2, maxWidth);

  if (data.nickname) {
    ctx.font = `italic 500 40px ${SYSTEM_FONT}`;
    ctx.fillStyle = COLOR.pitch300;
    fillCentered(ctx, `"${data.nickname}"`, STORY_WIDTH / 2, 1036, 0, maxWidth);
  }
}

function drawHeadline(ctx: CanvasRenderingContext2D, data: StoryCardData, display: string) {
  const headline = pickHeadline(data);

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 230px ${display}`;
  ctx.fillStyle = COLOR.pitch400;
  ctx.shadowColor = "rgba(22, 184, 115, 0.4)";
  ctx.shadowBlur = 50;
  ctx.fillText(headline.value, STORY_WIDTH / 2, 1244);
  ctx.restore();

  ctx.font = `600 36px ${display}`;
  ctx.fillStyle = COLOR.slate300;
  fillCentered(ctx, headline.label, STORY_WIDTH / 2, 1288, 7);

  if (headline.secondary) {
    ctx.font = `500 30px ${SYSTEM_FONT}`;
    ctx.fillStyle = COLOR.slate400;
    fillCentered(ctx, headline.secondary, STORY_WIDTH / 2, 1334);
  }
}

function drawStatTiles(ctx: CanvasRenderingContext2D, data: StoryCardData, display: string) {
  const tiles: { icon: IconName; value: number; label: string }[] = [
    { icon: "calendar", value: data.played, label: "PARTIDAS" },
    { icon: "trophy", value: data.won, label: "VITÓRIAS" },
    { icon: "goal", value: data.goals, label: "GOLS" },
    { icon: "handshake", value: data.assists, label: "ASSISTÊNCIAS" },
  ];

  // Grade 2x2: a base da grade encosta no fim da faixa segura.
  const gap = 20;
  const tileWidth = (STORY_WIDTH - 2 * MARGIN - gap) / 2;
  const tileHeight = 130;
  const top = SAFE_BOTTOM - (2 * tileHeight + gap);

  tiles.forEach((tile, index) => {
    const x = MARGIN + (index % 2) * (tileWidth + gap);
    const y = top + Math.floor(index / 2) * (tileHeight + gap);
    const cy = y + tileHeight / 2;

    ctx.save();
    roundRect(ctx, x, y, tileWidth, tileHeight, 28);
    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Icone + (numero sobre rotulo) formam um grupo, centralizado no bloco.
    ctx.save();
    ctx.font = `800 88px ${display}`;
    const numberWidth = ctx.measureText(String(tile.value)).width;
    const labelSize = fitFontSize(ctx, tile.label, tileWidth - 48 - 24 - 48, 26, 16, "600", display);
    ctx.font = `600 ${labelSize}px ${display}`;
    const labelWidth = measureTracked(ctx, tile.label, 3);
    ctx.restore();
    const groupWidth = 48 + 24 + Math.max(numberWidth, labelWidth);
    const startX = x + (tileWidth - groupWidth) / 2;

    drawIcon(ctx, tile.icon, startX, cy - 24, 48, COLOR.pitch400);

    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = `800 88px ${display}`;
    ctx.fillStyle = COLOR.white;
    ctx.fillText(String(tile.value), startX + 72, cy - 10);

    ctx.font = `600 ${labelSize}px ${display}`;
    ctx.fillStyle = COLOR.slate400;
    ctx.letterSpacing = "3px";
    ctx.fillText(tile.label, startX + 72, cy + 42);
    ctx.restore();
  });
}

function drawSignature(ctx: CanvasRenderingContext2D) {
  // Fica na faixa coberta pelo Instagram de proposito: e so assinatura.
  const lineY = STORY_HEIGHT - 190;
  const line = ctx.createLinearGradient(MARGIN, 0, STORY_WIDTH - MARGIN, 0);
  line.addColorStop(0, "rgba(22, 184, 115, 0)");
  line.addColorStop(0.5, "rgba(22, 184, 115, 0.6)");
  line.addColorStop(1, "rgba(22, 184, 115, 0)");
  ctx.fillStyle = line;
  ctx.fillRect(MARGIN, lineY, STORY_WIDTH - 2 * MARGIN, 3);

  ctx.font = `500 28px ${SYSTEM_FONT}`;
  ctx.fillStyle = COLOR.slate500;
  fillCentered(ctx, "voacraque.gabrielmizael.com", STORY_WIDTH / 2, lineY + 56);
}

/** Desenha o card 9:16 inteiro no canvas informado (o canvas ja precisa existir no DOM). */
export async function drawStoryCard(
  canvas: HTMLCanvasElement,
  data: StoryCardData,
  options: StoryCardOptions = {},
): Promise<void> {
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const [display, photo, logo] = await Promise.all([
    resolveDisplayFamily(options.displayFamily),
    loadImageSafe(data.photoUrl),
    loadImageSafe("/icon.svg"),
  ]);

  drawBackground(ctx);
  drawBrandRow(ctx, data, logo, display);
  drawTitleAndPlace(ctx, data, display);
  drawPhoto(ctx, photo, data, display);
  drawBadges(ctx, pickBadges(data), display);
  drawNameBlock(ctx, data, display);
  drawHeadline(ctx, data, display);
  drawStatTiles(ctx, data, display);
  drawSignature(ctx);
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png", 0.95));
}
