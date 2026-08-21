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
