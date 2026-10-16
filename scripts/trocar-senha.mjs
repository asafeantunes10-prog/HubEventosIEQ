/**
 * Troca a senha do painel de ponta a ponta: pede a senha escondida, grava os dois
 * secrets na Cloudflare e publica o site para a troca valer.
 *
 * Uso (num terminal de verdade, nao dentro de editor sem terminal):
 *   npm run trocar-senha                 # pede a senha, grava, confere o git e publica
 *   npm run trocar-senha -- --sem-publicar   # grava, mas voce publica depois
 *   npm run trocar-senha -- --simular        # nao grava nem publica; so confere tudo
 *
 * POR QUE ESTE SCRIPT EXISTE, se `gerar-senha` ja existe: `gerar-senha` imprime dois
 * comandos para COPIAR E COLAR, e e exatamente ai que a coisa quebrava — token colado
 * como nome de segredo, hash de uma execucao com a senha de outra, valor com um `>` na
 * frente. Qualquer um desses vira "Senha incorreta" sem dizer por que. Aqui a senha
 * nunca passa por copiar e colar: o hash e a chave de sessao nascem da MESMA execucao e
 * vao direto para a Cloudflare.
 *
 * A senha nunca e impressa, nunca vai para argumento de linha de comando (que fica no
 * historico do terminal) e nunca e gravada em arquivo. So existe na memoria deste
 * processo, e na Cloudflare depois de virar hash.
 *
 * Variavel de ambiente NOVA_SENHA: so para teste automatizado (substitui a pergunta).
 */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

import { chaveDeSessao, hashDaSenha } from './gerar-senha.mjs'

const RAIZ = resolve(import.meta.dirname, '..')
const WRANGLER = resolve(RAIZ, 'node_modules/wrangler/bin/wrangler.js')
const PROJETO = 'eventos-ieq'
const TAMANHO_MINIMO = 12
const TAMANHO_MAXIMO = 128

const simular = process.argv.includes('--simular')
const semPublicar = process.argv.includes('--sem-publicar')

/**
 * Le uma linha do teclado SEM mostrar o que se digita. Precisa de terminal (TTY):
 * sem ele nao ha como esconder a digitacao, e preferimos recusar a pedir uma senha
 * em texto puro.
 */
function pedirSecreto(pergunta) {
  return new Promise((resolver) => {
    const entrada = process.stdin
    if (!entrada.isTTY) {
      console.error('\nEste comando precisa de um terminal para esconder a senha enquanto voce digita.')
      console.error('Abra o terminal do VS Code (Ctrl+") e rode de la.')
      process.exit(1)
    }

    process.stdout.write(pergunta)
    entrada.setRawMode(true)
    entrada.resume()
    entrada.setEncoding('utf8')

    let texto = ''
    const aoDigitar = (pedaco) => {
      // Colar chega de uma vez, as vezes com o Enter junto; por isso o laco.
      for (const c of pedaco) {
        if (c === '\r' || c === '\n') {
          entrada.setRawMode(false)
          entrada.pause()
          entrada.off('data', aoDigitar)
          process.stdout.write('\n')
          resolver(texto)
          return
        }
        if (c === '\u0003') {
          // Ctrl+C: o modo cru desliga o tratamento normal dele, entao e aqui que se sai.
          process.stdout.write('\nCancelado. Nada foi alterado.\n')
          process.exit(130)
        }
        if (c === '\u007f' || c === '\b') texto = texto.slice(0, -1)
        else texto += c
      }
    }
    entrada.on('data', aoDigitar)
  })
}

/** Devolve a mensagem do problema, ou null se a senha serve. */
function problemaDaSenha(senha) {
  if (senha.length < TAMANHO_MINIMO) {
    return `Use pelo menos ${TAMANHO_MINIMO} caracteres (a sua tem ${senha.length}). O login so deixa 10 tentativas erradas por 15 minutos, mas uma senha curta cai rapido se alguem um dia conseguir o hash.`
  }
  if (senha.length > TAMANHO_MAXIMO) return `Use no maximo ${TAMANHO_MAXIMO} caracteres.`
  if (senha !== senha.trim()) return 'A senha nao pode comecar nem terminar com espaco.'
  if (new Set(senha).size < 5) return 'Use mais variedade de caracteres (essa tem so letras repetidas).'
  if (/^\d+$/.test(senha)) return 'Use letras tambem, nao so numeros.'
  return null
}

/** Grava um secret do Pages lendo o valor da entrada padrao (nunca da linha de comando). */
function gravarSecret(nome, valor) {
  const r = spawnSync(
    process.execPath,
    [WRANGLER, 'pages', 'secret', 'put', nome, `--project-name=${PROJETO}`],
    { input: valor + '\n', encoding: 'utf8', cwd: RAIZ }
  )
  const saida = (r.stdout ?? '') + (r.stderr ?? '')
  const ok = r.status === 0 && /Success|Uploaded|Created/i.test(saida)
  if (!ok) {
    // Mostra o que o wrangler disse, sem nunca repetir o valor do segredo.
    const resumo = saida
      .split('\n')
      .filter((l) => l.trim() && !l.includes(valor))
      .slice(-6)
      .join('\n')
    console.error(`\nNao consegui gravar ${nome}:\n${resumo}`)
  }
  return ok
}

function git(...args) {
  return spawnSync('git', args, { encoding: 'utf8', cwd: RAIZ })
}

/**
 * A troca so vale depois de um deploy, e cada deploy SUBSTITUI o site inteiro. Publicar
 * de uma pasta com mudancas nao salvas, ou atrasada em relacao ao GitHub, apagaria do ar
 * o trabalho que ela nao tem (ja aconteceu uma vez, com dois PCs). Por isso o script
 * confere antes e, se nao estiver limpo, nao publica sozinho.
 */
function estadoDoGit() {
  const sujo = git('status', '--porcelain').stdout.trim()
  if (sujo) return 'ha mudancas nao salvas (commit) neste computador'

  // `@{upstream}` e o ramo remoto que este ramo acompanha, seja qual for o NOME do remoto
  // (`Trabalho` neste PC, `origin` num clone novo). Se qualquer passo falhar, a resposta e
  // "nao consegui conferir", nunca "esta em dia": um erro engolido aqui publicaria do mesmo
  // jeito, e foi publicar sem conferir que apagou o trabalho do outro PC.
  const buscou = git('fetch')
  if (buscou.status !== 0) return 'nao consegui falar com o GitHub para conferir se este computador esta em dia'
  const contagem = git('rev-list', '--count', 'HEAD..@{upstream}')
  if (contagem.status !== 0) return 'nao consegui descobrir qual e o ramo do GitHub que este acompanha'
  const atras = Number(contagem.stdout.trim())
  if (atras > 0) return `o GitHub tem ${atras} commit(s) que este computador nao tem (faca git pull)`
  return null
}

async function principal() {
  console.log('\n== Trocar a senha do painel ==\n')
  if (simular) console.log('(modo --simular: nada sera gravado nem publicado)\n')

  let senha = process.env.NOVA_SENHA
  if (senha === undefined) {
    senha = await pedirSecreto('Nova senha (nao aparece enquanto digita): ')
    const problema = problemaDaSenha(senha)
    if (problema) {
      console.error(`\n${problema}\nNada foi alterado.`)
      process.exit(1)
    }
    const confirmacao = await pedirSecreto('Repita a nova senha: ')
    if (confirmacao !== senha) {
      console.error('\nAs duas senhas nao sao iguais. Nada foi alterado.')
      process.exit(1)
    }
  } else {
    const problema = problemaDaSenha(senha)
    if (problema) {
      console.error(`\n${problema}`)
      process.exit(1)
    }
  }

  // Hash e chave de sessao nascem juntos, da mesma execucao.
  const hash = await hashDaSenha(senha)
  const segredo = chaveDeSessao()

  if (simular) {
    console.log('Senha aceita e hash gerado. Em modo normal eu gravaria SENHA_HASH e SESSAO_SEGREDO agora.')
    return
  }

  console.log('Gravando na Cloudflare...')
  if (!gravarSecret('SENHA_HASH', hash)) process.exit(1)
  console.log('  SENHA_HASH: gravado')
  if (!gravarSecret('SESSAO_SEGREDO', segredo)) {
    console.error(
      '\nO SENHA_HASH novo ja foi gravado mas a chave de sessao nao. Rode este comando de novo ' +
        'antes de publicar: os dois precisam vir da mesma execucao.'
    )
    process.exit(1)
  }
  console.log('  SESSAO_SEGREDO: gravado')

  if (semPublicar) {
    console.log('\nPronto, mas a troca so vale depois de publicar o site: rode `npm run implantar`.')
    return
  }

  const motivo = estadoDoGit()
  if (motivo) {
    console.log(`\nNao publiquei sozinho porque ${motivo}.`)
    console.log('Resolva isso e rode `npm run implantar`: a senha nova so vale depois da publicacao.')
    return
  }

  console.log('\nPublicando o site para a senha nova valer...\n')
  const deploy = spawnSync('npm', ['run', 'implantar'], { stdio: 'inherit', shell: true, cwd: RAIZ })
  if (deploy.status !== 0) {
    console.error('\nA publicacao falhou. Rode `npm run implantar` de novo: a senha nova so vale depois dela.')
    process.exit(1)
  }

  console.log('\nPronto. A senha antiga deixou de valer; entre em /admin com a nova.')
}

principal()
