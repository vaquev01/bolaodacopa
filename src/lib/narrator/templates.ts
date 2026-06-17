/**
 * Banco de frases do "Narrador raiz" — locução clássica exagerada, dramática,
 * com zoeira. Cada gerador recebe os DADOS REAIS e devolve o texto pronto.
 * A variação é determinística por event_key (hash), pra não repetir e pra ser
 * estável entre re-execuções (mesmo evento → mesma frase, mas o dedup já evita
 * repost).
 */

/** Hash estável de string → índice em [0, n). */
export function pick<T>(eventKey: string, arr: T[]): T {
  let h = 0;
  for (let i = 0; i < eventKey.length; i++) h = (h * 31 + eventKey.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}

export interface FtPick {
  name: string;
  pick: string; // ex "2x1" ou "Casa"
}

/** Bola rolando (jogo começou). */
export function kickoffBody(eventKey: string, home: string, away: string): string {
  const t = pick(eventKey, [
    `🔴 E A BOLA... ROLA! Começa ${home} x ${away}! Senhoras e senhores, os palpites estão TRANCADOS — agora é torcer e sofrer. NÃO TEM MAIS VOLTA!`,
    `🔴 ATENÇÃO! ${home} e ${away} em campo! O apito soou, os cartões estão fechados a sete chaves. Quem palpitou, palpitou. O resto é história!`,
    `🔴 SILÊNCIO NO ESTÁDIO... ${home} x ${away} COMEÇANDO! É a hora da verdade, meus amigos. Cada gol vale ponto, cada erro vale vergonha!`,
    `🔴 ROLA A BOLA em ${home} x ${away}! Que comece o espetáculo! Os palpites já era — agora só resta o destino e a zoeira que vem por aí.`,
  ]);
  return t;
}

/** Fim de jogo: placar + quem cravou + zoeira em quem errou feio. */
export function fulltimeBody(
  eventKey: string,
  home: string,
  away: string,
  hs: number,
  as: number,
  exacts: string[], // cravaram o placar
  worst: FtPick | null, // o erro mais "engraçado" (palpite mais distante)
): string {
  const placar = `${home} ${hs}x${as} ${away}`;
  const abre = pick(eventKey, [
    `📢 FIM DE JOGO! ${placar}!`,
    `⏱️ ACABOU EM ${home.toUpperCase()}! ${placar}.`,
    `📢 É O FIM! Placar final: ${placar}!`,
    `⏱️ APITOU O JUIZ! ${placar} é o resultado que vai pra história.`,
  ]);

  let meio = "";
  if (exacts.length === 1) {
    meio = pick(eventKey + "x", [
      ` E CRAVOU, SENHORES: ${exacts[0]} acertou o placar EM CHEIO! 🎯 Tirem o chapéu.`,
      ` Um nome se destaca: ${exacts[0]} bateu o martelo no placar exato! 🎯 Aplausos.`,
    ]);
  } else if (exacts.length > 1) {
    meio = ` BANCA DE VIDENTES! ${exacts.join(", ")} cravaram o placar exato! 🎯🎯`;
  } else {
    meio = pick(eventKey + "0", [
      ` E NINGUÉM, repito, NINGUÉM cravou esse placar. A bola não respeita palpiteiro.`,
      ` Placar que pegou a galera toda de calças curtas — zero acertos exatos!`,
    ]);
  }

  let fim = "";
  if (worst) {
    fim = pick(eventKey + "w", [
      ` E o prêmio de palpite mais corajoso vai pro ${worst.name}, que apostou ${worst.pick}. Senta lá, ${worst.name}. 🤡`,
      ` Menção (des)honrosa pro ${worst.name} e seu ${worst.pick}... tá explicando até agora. 🙈`,
      ` Já o ${worst.name}, com ${worst.pick}, viu um jogo bem diferente do resto da humanidade. 😂`,
    ]);
  }

  return abre + meio + fim;
}

/** Novo líder no ranking. */
export function leaderBody(eventKey: string, name: string, points: number): string {
  return pick(eventKey, [
    `👑 TEMOS UM NOVO LÍDER! ${name} assume a ponta com ${points} pts e manda um abraço pra plateia lá de cima!`,
    `👑 VIROU! ${name} é o novo dono da liderança — ${points} pts. O trono mudou de dono, anota aí!`,
    `👑 PASSOU NA FRENTE! ${name} dispara na liderança com ${points} pts. O resto que corra atrás!`,
  ]);
}

/** Resumo do dia. */
export function dailyBody(eventKey: string, leaderName: string, leaderPts: number, decided: number): string {
  const jogos = decided === 1 ? "1 jogo decidido" : `${decided} jogos decididos`;
  return pick(eventKey, [
    `📅 FECHA-SE A CORTINA DE MAIS UM DIA DE COPA! ${jogos} hoje. Na liderança, firme e forte: ${leaderName} com ${leaderPts} pts. Amanhã tem mais — descansem os palpites!`,
    `📅 ENCERRADO O DIA! ${jogos}. ${leaderName} dorme na ponta com ${leaderPts} pts. Os outros que sonhem com a virada. Até amanhã!`,
  ]);
}
