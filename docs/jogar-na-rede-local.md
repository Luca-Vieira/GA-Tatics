# Como hospedar uma partida na rede local (LAN)

Uma pessoa é a **anfitriã**: o computador dela roda o jogo. As outras só abrem um link no navegador, no computador ou no celular, **sem instalar nada**.

```
computador do anfitrião
├── página do jogo ........ porta 5173
└── servidor de partidas .. porta 8787
        ▲
        └── os outros aparelhos da mesma rede abrem http://IP-DO-ANFITRIÃO:5173
```

> ⚠️ **Use só numa rede de confiança**, como a de casa ou a do trabalho com autorização. O jogo na rede local não tem login de jogador nem criptografia, e o modo usado aqui deixa o código do projeto visível para quem está na rede. **Não abra essas portas no roteador.** Para jogar pela internet, veja [Publicando o jogo numa VPS](hospedagem-do-servidor.md).

Os exemplos são para **Windows (PowerShell)**. As diferenças no Mac e no Linux estão no fim.

## Antes de começar

O anfitrião precisa de:

- [Node.js](https://nodejs.org/) **22 ou mais novo** (confira com `node --version`);
- [Git](https://git-scm.com/), ou o projeto baixado como ZIP.

Todos os aparelhos precisam estar **na mesma rede** (mesmo Wi-Fi ou cabo no mesmo roteador). Redes de visitantes costumam impedir que um aparelho enxergue o outro.

## 1. Baixar o jogo (só na primeira vez)

A versão atual está na branch **`versao-2`**. A `main` guarda a versão antiga, por isso o comando abaixo escolhe a branch:

```powershell
git clone --branch versao-2 https://github.com/Luca-Vieira/GA-Tatics.git
```

```powershell
cd GA-Tatics
```

```powershell
npm install
```

Sem Git: na página do repositório, escolha a branch `versao-2`, clique em **Code → Download ZIP**, extraia e abra o PowerShell dentro da pasta.

## 2. Ligar o jogo

São **duas janelas** do PowerShell, as duas na pasta do jogo. Deixe as duas abertas enquanto jogarem.

**Janela 1, o servidor de partidas:**

```powershell
npm run server -- --lan
```

Ele mostra os endereços do computador, por exemplo `ws://192.168.0.15:8787`.

**Janela 2, a página do jogo:**

```powershell
npm run dev -- --host
```

Ela mostra uma ou mais linhas `Network:`, por exemplo `http://192.168.0.15:5173/`.

O `--lan` e o `--host` são o que abre o jogo para a rede. Sem eles, só o próprio computador consegue entrar.

### Qual é o endereço certo?

Use o IP da sua rede **Wi-Fi ou Ethernet**. Ele costuma começar com `192.168.`, com `10.` ou ficar entre `172.16.` e `172.31.`. Ignore os de VPN e de adaptadores virtuais (a janela 2 mostra o nome de cada um). Para conferir:

```powershell
ipconfig
```

Procure **Endereço IPv4** no adaptador que você está usando.

## 3. Liberar no firewall do Windows

Na primeira vez, o Windows pode perguntar se o **Node.js** pode receber conexões. Permita em **redes privadas**. Não desligue o firewall.

Se a pergunta não aparecer e os outros aparelhos não conseguirem entrar:

1. Confira se a sua rede está como **Privada**: *Configurações → Rede e Internet → (sua conexão) → Tipo de perfil de rede*. Faça isso apenas numa rede em que você confia. Nunca em Wi-Fi público.
2. Crie uma regra só para as duas portas do jogo, num PowerShell aberto **como administrador**:

```powershell
New-NetFirewallRule -DisplayName "Merge do Escritorio (LAN)" -Direction Inbound -Protocol TCP -LocalPort 5173,8787 -Profile Private -Action Allow
```

Para remover a regra depois:

```powershell
Remove-NetFirewallRule -DisplayName "Merge do Escritorio (LAN)"
```

## 4. Chamar a galera

1. Todos abrem **`http://IP-DO-ANFITRIÃO:5173`**, com o IP do passo 2. Use o **número do IP**: o nome do computador (`http://meu-pc:5173`) é recusado.
2. Cada um escreve o nome. O **endereço do servidor já vem preenchido**; é só clicar em **Conectar**.
3. Uma pessoa clica em **Criar sala** e escolhe quantos jogadores (de 2 a 8) e as regras. Se a sala for privada, passe o código e a senha.
4. As outras entram pela **lista de salas** ou pelo **código**.
5. Quem criou clica em **Iniciar partida**. As vagas vazias viram bots.

Quem chegar atrasado pode **Assistir**. No celular, use o aparelho **deitado**.

O anfitrião também pode jogar. Abrindo o mesmo link com o IP, ele confirma de quebra que o endereço funciona.

## Jogando por VPN (Radmin, Hamachi, Tailscale)

Por segurança, o servidor só aceita páginas abertas por um IP de rede doméstica. Os IPs dessas VPNs ficam em **outras faixas** (como `26.`, `25.` ou `100.`), então a página abre, mas **Conectar falha**. Libere o endereço que os seus amigos vão usar, com o seu IP da VPN no lugar do exemplo, e **na mesma janela** ligue o servidor:

```powershell
$env:ALLOWED_ORIGINS = "http://26.10.20.30:5173"
```

```powershell
npm run server -- --lan
```

O valor precisa ter exatamente o começo do link que as pessoas abrem: `http://`, IP e porta, sem barra no fim. Para liberar mais de um, separe por vírgula. A liberação vale só enquanto a janela estiver aberta.

O Windows pode tratar o adaptador da VPN como rede **Pública**. Nesse caso, a regra do passo 3, que é só para redes privadas, não vale para ele. Só libere uma VPN em que apenas pessoas de confiança estejam.

## Painel de administração (opcional)

Serve para criar personagens e enviar sprites. Antes de ligar o servidor, defina um login **na mesma janela**:

```powershell
$env:ADMIN_USERNAME = Read-Host "Usuario do admin"
```

```powershell
$env:ADMIN_PASSWORD = Read-Host "Senha do admin"
```

```powershell
npm run server -- --lan
```

A senha precisa ter 8 caracteres ou mais e aparece na tela enquanto você digita. Abra **`http://localhost:5173/admin`** no próprio computador anfitrião.

- Na rede local a senha **não é criptografada**. Use o painel só no computador anfitrião e uma senha que não seja usada em outro lugar.
- O que for publicado fica na pasta `server-data/` e vale para quem se conectar a este servidor. A partida **contra bots** não usa esse conteúdo.

## Encerrar

Aperte **`Ctrl+C`** nas duas janelas. As partidas em andamento terminam. Se você criou a regra de firewall e não vai mais jogar, remova-a.

## Atualizar o jogo

Com o jogo desligado, na pasta dele:

```powershell
git pull
```

```powershell
npm install
```

Quem estiver com a página aberta deve recarregar com `Ctrl+F5`.

## Se algo não funcionar

| O que acontece | O que conferir |
| --- | --- |
| A página não abre no outro aparelho | A janela 2 foi ligada com `--host`? O IP está certo? O firewall (passo 3) liberou? Os dois estão na mesma rede, e não numa rede de visitantes? |
| A página abre, mas **Conectar** falha | A janela 1 está aberta e foi ligada com `--lan`? A porta 8787 está liberada no firewall? |
| A janela 1 mostra `Conexão recusada: origem não permitida (...)` | A pessoa abriu o jogo por VPN ou pelo nome do computador. Use o IP da rede local ou libere o endereço mostrado, como na parte de VPN. |
| O campo do servidor mostra `ws://localhost:8787` | A página foi aberta por `localhost`. Nos outros aparelhos, abra pelo IP do anfitrião. |
| `EADDRINUSE` ou "porta em uso" | Já existe um servidor ligado em outra janela. Feche-o com `Ctrl+C`. |
| O IP deixou de funcionar | O roteador pode ter dado outro IP ao computador. Confira de novo com `ipconfig`. |
| Aviso de versão diferente | Anfitrião: atualize o jogo e reinicie as duas janelas. Os outros: `Ctrl+F5`. |

## Mac e Linux

Os comandos `git` e `npm` são os mesmos. Veja o IP com `ifconfig` ou `ip a`, e libere as portas 5173 e 8787 no firewall, se houver um ligado. Variáveis de ambiente vão na mesma linha do comando:

```bash
ALLOWED_ORIGINS="http://26.10.20.30:5173" npm run server -- --lan
```
