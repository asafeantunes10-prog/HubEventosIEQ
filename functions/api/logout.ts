import { cookieDeLogout } from '../lib/sessao'

/** POST /api/logout — apaga o cookie de sessao. */
export const onRequestPost: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: { 'Set-Cookie': cookieDeLogout() } })
}
