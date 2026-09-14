import type {
  Course,
  Foot,
  GameDayStatus,
  MatchEndReason,
  MatchEventType,
  MatchStatus,
  PaymentMethod,
  PaymentStatus,
  Position,
  Role,
} from "@prisma/client";

export const ROLE_LABEL: Record<Role, string> = {
  SUPERADMIN: "Superadmin",
  ADMIN: "Organizador",
  USER: "Jogador",
};

export const FOOT_LABEL: Record<Foot, string> = {
  LEFT: "Canhoto",
  RIGHT: "Destro",
  BOTH: "Ambidestro",
};

export const POSITION_LABEL: Record<Position, string> = {
  GOALKEEPER: "Goleiro",
  FIXO: "Fixo",
  ALA: "Ala",
  PIVO: "Pivô",
};

export const COURSE_LABEL: Record<Course, string> = {
  LCC: "LCC",
  SI: "SI",
  OTHER: "Outro",
};

export const GAMEDAY_STATUS_LABEL: Record<GameDayStatus, string> = {
  OPEN: "Inscrições abertas",
  TEAMS_SET: "Times definidos",
  LIVE: "Rolando agora",
  FINISHED: "Encerrada",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  PIX: "PIX",
  ON_SITE: "Pago no local",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: "Aguardando",
  CONFIRMED: "Confirmado",
  REJECTED: "Recusado",
};

export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  SCHEDULED: "Pronta para começar",
  RUNNING: "Em andamento",
  PAUSED: "Pausada",
  FINISHED: "Encerrada",
};

export const MATCH_END_REASON_LABEL: Record<MatchEndReason, string> = {
  GOALS: "Por gols",
  TIME: "Pelo tempo",
  MANUAL: "Encerrada pelo organizador",
};

export const MATCH_EVENT_LABEL: Record<MatchEventType, string> = {
  GOAL: "Gol",
  ASSIST: "Assistência",
};

type TeamPalette = { chip: string; text: string; border: string; dot: string; bar: string };

const TEAM_COLORS: Record<string, TeamPalette> = {
  A: {
    chip: "bg-emerald-500/15",
    text: "text-emerald-300",
    border: "border-emerald-500/40",
    dot: "bg-emerald-400",
    bar: "bg-emerald-500",
  },
  B: {
    chip: "bg-sky-500/15",
    text: "text-sky-300",
    border: "border-sky-500/40",
    dot: "bg-sky-400",
    bar: "bg-sky-500",
  },
  C: {
    chip: "bg-amber-500/15",
    text: "text-amber-300",
    border: "border-amber-500/40",
    dot: "bg-amber-400",
    bar: "bg-amber-500",
  },
  D: {
    chip: "bg-fuchsia-500/15",
    text: "text-fuchsia-300",
    border: "border-fuchsia-500/40",
    dot: "bg-fuchsia-400",
    bar: "bg-fuchsia-500",
  },
  E: {
    chip: "bg-rose-500/15",
    text: "text-rose-300",
    border: "border-rose-500/40",
    dot: "bg-rose-400",
    bar: "bg-rose-500",
  },
};

const NEUTRAL_TEAM: TeamPalette = {
  chip: "bg-slate-500/15",
  text: "text-slate-300",
  border: "border-slate-500/40",
  dot: "bg-slate-400",
  bar: "bg-slate-500",
};

export function teamColor(name: string): TeamPalette {
  return TEAM_COLORS[name] ?? NEUTRAL_TEAM;
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDateTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}
