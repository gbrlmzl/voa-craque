export type GameDayValues = {
  title: string;
  scheduledAt: string;
  location: string;
  price: string;
  durationMin: string;
  goalsToWin: string;
  maxPlayers: string;
  teamSize: string;
  pixKey: string;
  notes: string;
};

/**
 * Fica fora de useGameDayForm.ts ("use client") de proposito: um valor comum
 * importado dali por um Server Component vira uma referencia de cliente, que
 * nao da para espalhar (`{ ...NEW_GAMEDAY, pixKey }`) no servidor. Mesmo motivo
 * de profile-defaults.ts.
 */
export const NEW_GAMEDAY: GameDayValues = {
  title: "",
  scheduledAt: "",
  location: "",
  price: "4,50",
  durationMin: "8",
  goalsToWin: "2",
  maxPlayers: "20",
  teamSize: "4",
  pixKey: "",
  notes: "",
};
