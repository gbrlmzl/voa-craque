import { z } from "zod";

const email = z
  .string()
  .trim()
  .min(1, "Informe o e-mail.")
  .email("E-mail invalido.")
  .transform((value) => value.toLowerCase());

const password = z.string().min(8, "A senha precisa de pelo menos 8 caracteres.").max(72);

export const credentialsSchema = z.object({
  email,
  password: z.string().min(1, "Informe a senha."),
});

export const registerSchema = z
  .object({
    name: z.string().trim().min(3, "Informe seu nome completo.").max(80),
    email,
    password,
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "As senhas nao conferem.",
    path: ["passwordConfirm"],
  });

export const profileSchema = z.object({
  nickname: z.string().trim().max(30).optional().or(z.literal("")),
  foot: z.enum(["LEFT", "RIGHT", "BOTH"], { message: "Escolha o pe que voce chuta." }),
  position: z.enum(["GOALKEEPER", "FIXO", "ALA", "PIVO"], { message: "Escolha sua posicao." }),
  age: z.coerce.number().int("Idade invalida.").min(14, "Idade minima 14 anos.").max(70),
  heightCm: z.coerce.number().int().min(130, "Altura em centimetros.").max(230),
  weightKg: z.coerce.number().int().min(35, "Peso em quilos.").max(200),
  photoUrl: z.string().trim().max(500).optional().or(z.literal("")),
});

export const gameDaySchema = z.object({
  title: z.string().trim().min(3, "De um nome para a pelada.").max(80),
  scheduledAt: z.coerce.date({ message: "Data e hora invalidas." }),
  location: z.string().trim().min(3, "Informe o local.").max(120),
  pricePerPlayerCents: z.coerce.number().int().min(0).max(100000),
  matchDurationSec: z.coerce.number().int().min(60, "Minimo de 1 minuto.").max(3600),
  goalsToWin: z.coerce.number().int().min(1).max(20),
  maxPlayers: z.coerce.number().int().min(10).max(50),
  teamSize: z.coerce.number().int().min(3).max(7),
  pixKey: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export const registrationSchema = z.object({
  paymentMethod: z.enum(["PIX", "ON_SITE"], { message: "Escolha a forma de pagamento." }),
  receiptUrl: z.string().trim().max(500).optional().or(z.literal("")),
});

export const paymentDecisionSchema = z.object({
  paymentStatus: z.enum(["PENDING", "CONFIRMED", "REJECTED"]),
  rejectedReason: z.string().trim().max(200).optional().or(z.literal("")),
});

export const starsSchema = z.object({
  stars: z
    .union([z.coerce.number(), z.null()])
    .refine((value) => value === null || (value >= 1 && value <= 5), "As estrelas vao de 1 a 5.")
    .refine(
      (value) => value === null || Math.round(value * 2) === value * 2,
      "Use incrementos de meia estrela.",
    ),
});

export const skillsSchema = z.object({
  skillCodes: z.array(z.string().trim().min(1)).max(10),
});

export const roleSchema = z.object({
  role: z.enum(["SUPERADMIN", "ADMIN", "USER"]),
});

export const drawSchema = z.object({
  seed: z.coerce.number().int().optional(),
});

export const manualTeamsSchema = z.object({
  teams: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(2),
        playerIds: z.array(z.string().min(1)),
      }),
    )
    .min(2, "Monte pelo menos dois times.")
    .max(5, "No maximo cinco times."),
  reserveIds: z.array(z.string().min(1)).default([]),
});

export const matchActionSchema = z.object({
  action: z.enum(["START", "PAUSE", "RESUME", "END"]),
});

export const matchEventSchema = z.object({
  type: z.enum(["GOAL", "ASSIST"]),
  userId: z.string().min(1),
  teamId: z.string().min(1),
});

export const systemSettingsSchema = z.object({
  publicAccessEnabled: z.boolean(),
  registrationOpen: z.boolean(),
  maintenanceMessage: z.string().trim().min(3).max(240),
});

export const auditQuerySchema = z.object({
  actorId: z.string().trim().optional(),
  entity: z.string().trim().optional(),
  action: z.string().trim().optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export type ProfileInput = z.infer<typeof profileSchema>;
export type GameDayInput = z.infer<typeof gameDaySchema>;
export type ManualTeamsInput = z.infer<typeof manualTeamsSchema>;
