import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * "2026-08-21" (como o D1 guarda) vira "21 de agosto de 2026".
 *
 * O parse e feito na mao (nao com `new Date("2026-08-21")`) porque essa forma
 * o navegador interpreta como meia-noite UTC. Numa maquina a oeste de
 * Greenwich isso volta um dia — um evento de sabado apareceria como sexta.
 * `data_evento` e uma data de calendario, sem fuso: 21 de agosto e 21 de
 * agosto em qualquer lugar, e so o parse manual respeita isso.
 */
export function formatarData(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  const local = new Date(ano, mes - 1, dia)

  return local.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/*
  Faixa Unicode dos acentos combinantes (0x0300 a 0x036f) que `normalize('NFD')`
  separa da letra base. Montada por codigo de ponto, e nao por escape dentro de
  uma regex literal, de proposito: as duas formas produzem o mesmo resultado,
  mas so esta sobrevive copia e cola entre editores sem risco de o escape virar
  o proprio caractere combinante — o que quebraria a regex em silencio.
*/
const INICIO_COMBINANTE = 0x0300
const FIM_COMBINANTE = 0x036f
const ACENTOS_COMBINANTES = new RegExp(
  `[${String.fromCodePoint(INICIO_COMBINANTE)}-${String.fromCodePoint(FIM_COMBINANTE)}]`,
  'g'
)

/**
 * Transforma "Culto de Jovens 2026" em "culto-de-jovens-2026": o endereco
 * publico do evento (`/e/culto-de-jovens-2026`) e o prefixo das fotos dele no
 * projeto de fotos.
 *
 * O slug precisa seguir a regra que `functions/api/admin/eventos.ts` valida
 * (`SLUG_VALIDO`): letras minusculas, numeros e hifen.
 */
export function paraSlug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(ACENTOS_COMBINANTES, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
