import { PrismaClient, type Course, type Foot, type Position } from "@prisma/client";
import { hash } from "bcryptjs";
import { SKILL_CATALOG } from "../src/lib/skills";

const prisma = new PrismaClient();

type SamplePlayer = {
  name: string;
  nickname: string;
  position: Position;
  foot: Foot;
  age: number;
  heightCm: number;
  weightKg: number;
  course: Course;
  stars: number | null;
};

const SAMPLE_PLAYERS: SamplePlayer[] = [
  { name: "Arthur Nogueira", nickname: "Tutu", position: "GOALKEEPER", foot: "RIGHT", age: 22, heightCm: 186, weightKg: 84, course: "SI", stars: 4 },
  { name: "Bruno Sacramento", nickname: "Bruninho", position: "GOALKEEPER", foot: "LEFT", age: 21, heightCm: 181, weightKg: 79, course: "LCC", stars: 3 },
  { name: "Caio Vasconcelos", nickname: "Caião", position: "GOALKEEPER", foot: "RIGHT", age: 24, heightCm: 178, weightKg: 88, course: "SI", stars: 3.5 },
  { name: "Danilo Peixoto", nickname: "Dan", position: "GOALKEEPER", foot: "RIGHT", age: 20, heightCm: 183, weightKg: 81, course: "LCC", stars: null },
  { name: "Eduardo Vilela", nickname: "Dudu", position: "FIXO", foot: "RIGHT", age: 23, heightCm: 179, weightKg: 78, course: "SI", stars: 4.5 },
  { name: "Felipe Andrade", nickname: "Lipe", position: "FIXO", foot: "LEFT", age: 22, heightCm: 175, weightKg: 74, course: "LCC", stars: 3 },
  { name: "Gabriel Marques", nickname: "Gabi", position: "FIXO", foot: "RIGHT", age: 25, heightCm: 188, weightKg: 90, course: "SI", stars: 5 },
  { name: "Heitor Campelo", nickname: "Tote", position: "FIXO", foot: "BOTH", age: 19, heightCm: 172, weightKg: 68, course: "LCC", stars: null },
  { name: "Igor Bastos", nickname: "Igão", position: "ALA", foot: "RIGHT", age: 21, heightCm: 176, weightKg: 71, course: "SI", stars: 4 },
  { name: "João Pedro Lira", nickname: "JP", position: "ALA", foot: "LEFT", age: 20, heightCm: 170, weightKg: 66, course: "LCC", stars: 4.5 },
  { name: "Kaique Serrano", nickname: "Kaká", position: "ALA", foot: "RIGHT", age: 22, heightCm: 174, weightKg: 70, course: "SI", stars: 2.5 },
  { name: "Lucas Tavares", nickname: "Luquinha", position: "ALA", foot: "RIGHT", age: 23, heightCm: 181, weightKg: 77, course: "LCC", stars: null },
  { name: "Matheus Rangel", nickname: "Teteu", position: "ALA", foot: "LEFT", age: 24, heightCm: 168, weightKg: 64, course: "SI", stars: 3.5 },
  { name: "Nícolas Braga", nickname: "Nico", position: "ALA", foot: "RIGHT", age: 19, heightCm: 177, weightKg: 73, course: "LCC", stars: 3 },
  { name: "Otávio Meireles", nickname: "Tavinho", position: "ALA", foot: "BOTH", age: 26, heightCm: 184, weightKg: 86, course: "OTHER", stars: null },
  { name: "Pedro Henrique Sá", nickname: "PH", position: "PIVO", foot: "RIGHT", age: 22, heightCm: 190, weightKg: 92, course: "SI", stars: 5 },
  { name: "Rafael Quirino", nickname: "Rafa", position: "PIVO", foot: "LEFT", age: 21, heightCm: 182, weightKg: 80, course: "LCC", stars: 4 },
  { name: "Samuel Fontes", nickname: "Samuka", position: "PIVO", foot: "RIGHT", age: 20, heightCm: 173, weightKg: 69, course: "SI", stars: 2 },
  { name: "Thiago Belmiro", nickname: "Tigrão", position: "PIVO", foot: "RIGHT", age: 27, heightCm: 179, weightKg: 83, course: "OTHER", stars: null },
  { name: "Vinícius Aguiar", nickname: "Vini", position: "PIVO", foot: "LEFT", age: 18, heightCm: 166, weightKg: 62, course: "LCC", stars: null },
];

/** Algumas skills já atribuídas, para a tela de ranking nascer com conteúdo. */
const SAMPLE_SKILLS: Record<string, string[]> = {
  "gabriel.marques@voacraque.app": ["tita", "diferenciado"],
  "pedro.sa@voacraque.app": ["tita", "acougueiro"],
  "joao.lira@voacraque.app": ["garcom", "racudo"],
  "eduardo.vilela@voacraque.app": ["brocador"],
  "samuel.fontes@voacraque.app": ["ensaboado", "ele-se-esforca"],
  "kaique.serrano@voacraque.app": ["nao-marca"],
  "matheus.rangel@voacraque.app": ["piter"],
};

function emailFor(name: string): string {
  const parts = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(" ")
    .filter(Boolean);
  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${first}.${last}@voacraque.app`;
}

async function main() {
  const superEmail = (process.env.SUPERADMIN_EMAIL ?? "super@voacraque.app").toLowerCase();
  const superPassword = process.env.SUPERADMIN_PASSWORD ?? "VoaCraque123!";
  const superName = process.env.SUPERADMIN_NAME ?? "Superadmin";

  await prisma.systemSetting.upsert({
    where: { id: "global" },
    update: {},
    create: { id: "global" },
  });

  for (const skill of SKILL_CATALOG) {
    await prisma.skill.upsert({
      where: { code: skill.code },
      update: { label: skill.label, polarity: skill.polarity },
      create: { code: skill.code, label: skill.label, polarity: skill.polarity },
    });
  }
  console.log(`[seed] ${SKILL_CATALOG.length} skills disponíveis`);

  const superadmin = await prisma.user.upsert({
    where: { email: superEmail },
    update: { role: "SUPERADMIN", name: superName },
    create: {
      email: superEmail,
      name: superName,
      role: "SUPERADMIN",
      passwordHash: await hash(superPassword, 10),
      profile: {
        create: {
          foot: "RIGHT",
          position: "FIXO",
          age: 30,
          heightCm: 178,
          weightKg: 78,
          course: "OTHER",
          courseName: "Coordenação",
          completed: true,
        },
      },
    },
  });
  console.log(`[seed] superadmin: ${superadmin.email}`);

  if ((process.env.SEED_SAMPLE_DATA ?? "true") !== "true") {
    console.log("[seed] SEED_SAMPLE_DATA=false, pulando dados de exemplo");
    return;
  }

  const admin = await prisma.user.upsert({
    where: { email: "organizador@voacraque.app" },
    update: { role: "ADMIN" },
    create: {
      email: "organizador@voacraque.app",
      name: "Rodrigo Organizador",
      role: "ADMIN",
      passwordHash: await hash("VoaCraque123!", 10),
      profile: {
        create: {
          nickname: "Digão",
          foot: "RIGHT",
          position: "ALA",
          age: 26,
          heightCm: 180,
          weightKg: 80,
          course: "SI",
          stars: 4,
          completed: true,
        },
      },
    },
  });
  console.log(`[seed] organizador: ${admin.email}`);

  const playerPassword = await hash("VoaCraque123!", 10);
  const skills = await prisma.skill.findMany();
  const skillByCode = new Map(skills.map((skill) => [skill.code, skill.id]));

  for (const player of SAMPLE_PLAYERS) {
    const email = emailFor(player.name);
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: player.name,
        role: "USER",
        passwordHash: playerPassword,
        profile: {
          create: {
            nickname: player.nickname,
            foot: player.foot,
            position: player.position,
            age: player.age,
            heightCm: player.heightCm,
            weightKg: player.weightKg,
            course: player.course,
            courseName: player.course === "OTHER" ? "Engenharia" : null,
            stars: player.stars,
            completed: true,
          },
        },
      },
      include: { profile: true },
    });

    const codes = SAMPLE_SKILLS[email];
    if (codes && user.profile) {
      for (const code of codes) {
        const skillId = skillByCode.get(code);
        if (!skillId) continue;
        await prisma.playerSkill.upsert({
          where: { profileId_skillId: { profileId: user.profile.id, skillId } },
          update: {},
          create: { profileId: user.profile.id, skillId, assignedById: admin.id },
        });
      }
    }
  }
  console.log(`[seed] ${SAMPLE_PLAYERS.length} jogadores de exemplo`);

  const existingGameDay = await prisma.gameDay.findFirst({ where: { title: "Pelada de quinta" } });
  if (!existingGameDay) {
    const nextThursday = new Date();
    nextThursday.setDate(nextThursday.getDate() + ((4 - nextThursday.getDay() + 7) % 7 || 7));
    nextThursday.setHours(19, 30, 0, 0);

    const gameDay = await prisma.gameDay.create({
      data: {
        title: "Pelada de quinta",
        scheduledAt: nextThursday,
        location: "Ginásio do campus",
        pricePerPlayerCents: 450,
        matchDurationSec: 600,
        goalsToWin: 2,
        maxPlayers: 20,
        teamSize: 5,
        pixKey: "pelada@voacraque.app",
        notes: "Leve camisa clara e escura.",
        createdById: admin.id,
      },
    });

    const players = await prisma.user.findMany({ where: { role: "USER" }, select: { id: true } });
    for (const [index, player] of players.entries()) {
      await prisma.registration.upsert({
        where: { gameDayId_userId: { gameDayId: gameDay.id, userId: player.id } },
        update: {},
        create: {
          gameDayId: gameDay.id,
          userId: player.id,
          paymentMethod: index % 3 === 0 ? "ON_SITE" : "PIX",
          paymentStatus: index < 16 ? "CONFIRMED" : "PENDING",
          confirmedById: index < 16 ? admin.id : null,
          confirmedAt: index < 16 ? new Date() : null,
          amountCents: gameDay.pricePerPlayerCents,
        },
      });
    }
    console.log(`[seed] pelada "${gameDay.title}" com ${players.length} inscritos`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("[seed] falhou", error);
    await prisma.$disconnect();
    process.exit(1);
  });
