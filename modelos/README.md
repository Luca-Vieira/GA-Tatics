# Modelos de personagem

Um arquivo pronto para cada jeito de jogar. Copie o que mais se parece com a sua ideia, mude os valores e importe no painel.

| Arquivo | O que mostra |
| --- | --- |
| [lutador.json](personagens/lutador.json) | Corpo a corpo, área em semicírculo e golpe forte. |
| [atirador_com_veneno.json](personagens/atirador_com_veneno.json) | À distância, em linha, com chance de veneno no ataque e dano em área. |
| [curador.json](personagens/curador.json) | Cura que só dispara com aliado ferido. |
| [protetor.json](personagens/protetor.json) | Tanque que se protege e protege os vizinhos. |
| [invocador.json](personagens/invocador.json) | Invoca criaturas (minions). |
| [criador_de_terreno.json](personagens/criador_de_terreno.json) | Deixa um terreno no chão, com duração e limite por personagem. |
| [clone_provocador.json](personagens/clone_provocador.json) | Cria um clone que atrai os inimigos. |
| [passivo_com_furia.json](personagens/passivo_com_furia.json) | Habilidade passiva (comportamento especial). |

## Como usar

1. Copie um arquivo e troque ao menos o `id` (letras minúsculas, números e `_`, sem repetir), o `name` e os textos. Se a habilidade invocar algo, troque também o nome da criatura.
2. No painel de administração, aba **Personagens**, abra **Importar personagens (JSON)**, cole o texto e importe. Vale um personagem, uma lista ou `{ "characters": [ ... ] }`.
3. Envie o sprite (PNG) e ajuste pelo formulário.
4. Para ele aparecer na loja, marque **Ativo** e coloque-o numa sinergia em **Rotação e distribuição**.
5. Publique.

Antes de publicar mudanças de equilíbrio, meça com `npm run sim`. Os modelos são pontos de partida: os números não foram balanceados.

Todos os campos, limites e efeitos estão explicados no arquivo que o painel baixa em **Baixar referência (JSON)**.
