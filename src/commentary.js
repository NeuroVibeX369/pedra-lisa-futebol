/**
 * Narração em português do Brasil.
 *
 * O sintetizador em speech.js fala apenas as palavras ensinadas aqui. As
 * sequências abaixo são fonemas aproximados para dar ao narrador retrô uma
 * pronúncia brasileira, sem depender da voz do navegador ou de arquivos de áudio.
 */
export const WORDS = {
  // Times
  pedra: ['P', 'EH', 'D', 'R', 'AH'],
  lisa: ['L', 'IY', 'Z', 'AH'],
  independencia: ['IY', 'N', 'D', 'IY', 'P', 'EH', 'N', 'D', 'EH', 'N', 'S', 'IY', 'AH'],

  // Placar
  zero: ['Z', 'EH', 'R', 'UW'],
  um: ['UW', 'M'],
  dois: ['D', 'OW', 'IH', 'S'],
  tres: ['T', 'R', 'EH', 'S'],
  quatro: ['K', 'W', 'AH', 'T', 'R', 'UW'],
  cinco: ['S', 'IH', 'N', 'K', 'UW'],
  seis: ['S', 'EY', 'S'],
  sete: ['S', 'EH', 'CH', 'IY'],
  oito: ['OW', 'IH', 'T', 'UW'],
  nove: ['N', 'AO', 'V', 'IY'],
  dez: ['D', 'EH', 'S'],
  onze: ['AO', 'N', 'Z', 'IY'],
  doze: ['D', 'OW', 'Z', 'IY'],

  // Jogo
  contra: ['K', 'OW', 'N', 'T', 'R', 'AH'],
  bola: ['B', 'OH', 'L', 'AH'],
  rolando: ['HH', 'OH', 'L', 'AH', 'N', 'D', 'UW'],
  gol: ['G', 'OH', 'L'],
  goool: ['G', 'OOL', 'L'],
  que: ['K', 'IY'],
  golaco: ['G', 'OH', 'L', 'AH', 'S', 'UW'],
  grande: ['G', 'R', 'AH', 'N', 'D', 'IY'],
  defesa: ['D', 'IY', 'F', 'EH', 'Z', 'AH'],
  defendeu: ['D', 'IY', 'F', 'EH', 'N', 'D', 'EH', 'UW'],
  vai: ['V', 'AY'],
  pra: ['P', 'R', 'AH'],
  cima: ['S', 'IY', 'M', 'AH'],
  arrancada: ['AH', 'HH', 'AH', 'N', 'K', 'AH', 'D', 'AH'],
  avancou: ['AH', 'V', 'AH', 'N', 'S', 'OW'],

  // Recomeços
  escanteio: ['IH', 'S', 'K', 'AH', 'N', 'T', 'EY', 'UW'],
  lateral: ['L', 'AH', 'T', 'EH', 'R', 'AH', 'L'],
  tiro: ['T', 'IY', 'R', 'UW'],
  de: ['D', 'IY'],
  meta: ['M', 'EH', 'T', 'AH'],
  para: ['P', 'AH', 'R', 'AH'],

  // Encerramento
  fim: ['F', 'IY', 'M'],
  jogo: ['JH', 'OH', 'G', 'UW'],
};

const NUMBERS = [
  'zero', 'um', 'dois', 'tres', 'quatro', 'cinco', 'seis',
  'sete', 'oito', 'nove', 'dez', 'onze', 'doze',
];

/** Lê o placar: "pedra lisa dois independencia zero". */
export function scoreWords(score) {
  if (score[0] > 12 || score[1] > 12) return '';
  return `pedra lisa ${NUMBERS[score[0]]} independencia ${NUMBERS[score[1]]}`;
}

/** Frases curtas para manter a voz retrô clara. */
export const LINES = {
  goal: ['goool', 'que golaco', 'gol'],
  save: ['defendeu', 'grande defesa', 'que defesa'],
  run: ['vai pra cima', 'que arrancada', 'avancou'],
  start: ['pedra lisa contra independencia', 'bola rolando'],
  fulltime: ['fim de jogo'],
};
