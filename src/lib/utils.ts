/**
 * Utilitários compartilhados para o app bolão.
 */

export const FLAG: Record<string, string> = {
  Brasil: "🇧🇷",
  Argentina: "🇦🇷",
  França: "🇫🇷",
  Alemanha: "🇩🇪",
  Espanha: "🇪🇸",
  Inglaterra: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  Itália: "🇮🇹",
  Portugal: "🇵🇹",
  Holanda: "🇳🇱",
  Croácia: "🇭🇷",
  Uruguai: "🇺🇾",
  Colômbia: "🇨🇴",
  México: "🇲🇽",
  EUA: "🇺🇸",
  "Estados Unidos": "🇺🇸",
  Canadá: "🇨🇦",
  Japão: "🇯🇵",
  Coreia: "🇰🇷",
  Senegal: "🇸🇳",
  Marrocos: "🇲🇦",
  Ghana: "🇬🇭",
  Nigéria: "🇳🇬",
  Cameroun: "🇨🇲",
  Suíça: "🇨🇭",
  Bélgica: "🇧🇪",
  Dinamarca: "🇩🇰",
  Polônia: "🇵🇱",
  Sérvia: "🇷🇸",
  Austrália: "🇦🇺",
  Arábia: "🇸🇦",
  "Arábia Saudita": "🇸🇦",
  Qatar: "🇶🇦",
  Equador: "🇪🇨",
  "Costa Rica": "🇨🇷",
  Tunísia: "🇹🇳",
  Iran: "🇮🇷",
};

export function getFlag(team: string): string {
  return FLAG[team] ?? "🏴";
}

/**
 * Formato legível de data/hora para pt-BR.
 * kickoff_at vem em UTC; exibe no timezone local do browser.
 */
export function formatKickoff(isoStr: string): { date: string; time: string } {
  const d = new Date(isoStr);
  const date = d.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  const time = d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  return { date, time };
}

/**
 * Countdown relativo até o kickoff (deadline).
 * Retorna null se já passou.
 */
export function deadlineLabel(kickoffIso: string, minutesBefore = 15): string | null {
  const deadline = new Date(new Date(kickoffIso).getTime() - minutesBefore * 60_000);
  const now = Date.now();
  const diff = deadline.getTime() - now;

  if (diff <= 0) return null;

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 1) return `Fecha em ${days} dias`;
  if (days === 1) return `Fecha em 1 dia`;
  if (hours >= 1) return `Fecha em ${hours}h ${minutes}min`;
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function deadlineUrgency(kickoffIso: string, minutesBefore = 15): "ok" | "warning" | "danger" | "closed" {
  const deadline = new Date(new Date(kickoffIso).getTime() - minutesBefore * 60_000);
  const diff = deadline.getTime() - Date.now();
  if (diff <= 0) return "closed";
  if (diff < 60 * 60 * 1000) return "danger";
  if (diff < 24 * 60 * 60 * 1000) return "warning";
  return "ok";
}

export function stageLabel(stage: string): string {
  const map: Record<string, string> = {
    group: "Fase de Grupos",
    r32: "Rodada de 32",
    r16: "Oitavas de Final",
    qf: "Quartas de Final",
    sf: "Semifinal",
    third: "3º Lugar",
    final: "Final",
  };
  return map[stage] ?? stage;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}
