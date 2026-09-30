# Politopia+

Jogo de estratégia por turnos para navegador e celular, inspirado em **The Battle of Polytopia**, com mais camadas de estratégia: ciência separada do dinheiro, recursos estratégicos, promoções de unidades, diplomacia, maravilhas, construções de cidade, rotas comerciais e uma IA que expande, negocia e conquista.

Roda direto no navegador, sem build e sem dependências: HTML, CSS e JavaScript puro, com o mapa desenhado em Canvas isométrico.

## Visual

Fantasia medieval sombria: paleta terrosa e acinzentada, texturas procedurais em cada terreno, luz vinda da esquerda, vegetação diferente por bioma (pinheiros nevados, matas fechadas, acácias da savana, arbustos secos do deserto), cidades de pedra com torre de menagem e estandartes, unidades como escudos heráldicos na cor da tribo, névoa de fumaça no território inexplorado e cinzas flutuando no ar (dá para desligar no menu). Títulos em Cinzel e texto em Alegreya Sans.

## Como jogar

- **Local:** abra `index.html` no navegador, ou sirva a pasta (`npm start` e acesse `http://localhost:8080`).
- **GitHub Pages:** em *Settings → Pages*, publique a branch com a pasta raiz. No celular, use "Adicionar à tela inicial" para jogar em tela cheia.

Controles: toque/clique para selecionar, arraste para mover o mapa, pinça ou roda do mouse para zoom. Atalhos: `Enter` encerra o turno, `N` próxima unidade, `T` tecnologia, `D` diplomacia, `C` cidades, `Esc` fecha janelas.

A partida é salva automaticamente no aparelho a cada turno.

## O que tem de "mais" em relação ao Polytopia

| Sistema | Como funciona aqui |
| --- | --- |
| **Duas moedas** | ★ Estrelas pagam unidades e construções; ⚗ Ciência paga tecnologias. O custo das tecnologias cresce com o número de cidades. Depois da árvore completa, há Tecnologias do Futuro. |
| **Árvore de 27 tecnologias em 4 eras** | Tecnologias da Era IV exigem dois pré-requisitos (ex.: Pólvora = Forja + Matemática). |
| **Recursos estratégicos** | Mina em minério fornece **Ferro** (Espadachim, Mosqueteiro, Canhão); Pasto em cavalos fornece **Cavalos** (Cavaleiro). |
| **Construções de cidade** | Muralhas, Quartel, Celeiro, Biblioteca, Templo, Universidade e Banco, além das melhorias de terreno com bônus de vizinhança (Serraria, Moinho, Forja, Mercado). |
| **6 maravilhas únicas no mundo** | Oráculo, Pirâmides, Grande Biblioteca, Colosso, Grande Muralha e Olho dos Deuses. |
| **Promoções** | Abates dão XP; Veteranos (3 XP) e Elite (7 XP) escolhem Força, Escudo, Vigor ou Agilidade. |
| **Pedra-papel-tesoura** | Piqueiros anulam montados; montados não sobem montanhas; colinas, florestas, montanhas e pântanos alteram a defesa; fortificação dá +25%. |
| **Diplomacia** | Guerra e paz com cada tribo, propostas da IA, reputação que cai ao quebrar tratados. |
| **Rotas comerciais** | Cidades ligadas à capital por estrada ou porto ganham população e renda. |
| **Névoa de guerra real** | Casas exploradas mas fora de visão escondem as unidades inimigas. |
| **Mar** | Portos permitem embarcar; Barco, Navio e Couraçado conforme a tecnologia naval. |
| **9 terrenos e 9 recursos** | Incluindo colinas, deserto, tundra e pântano (que pode ser drenado). |
| **Ruínas** | Prêmios aleatórios: tesouro, pergaminhos, tecnologia, veterano, mapa ou sobreviventes. |
| **Modos** | Dominação ou Pontos (30/50 turnos), 4 tipos de mapa, 4 tamanhos, 4 dificuldades e passa-e-joga local para até 6 jogadores. |

### Tribos

| Tribo | Começa com | Vantagem |
| --- | --- | --- |
| 🦙 Aymará | Escalada + Mineração | Minas e Garimpos dão +1 população |
| 🦜 Tupinás | Caça | Florestas custam 1 de movimento e sempre dão defesa |
| 🐺 Vikar | Pesca | Embarcações +1 movimento; pescar dá +1 população |
| 🐪 Qadir | Montaria (Cavaleiro Leve) | Capital +2★; cidades conectadas +1★ |
| 🐉 Han-Lu | Organização | Tecnologias 10% mais baratas |
| 🦁 Zambé | Caça + guerreiro extra | XP em dobro e cura +2 |

### Combate

Mesma base do Polytopia:

```
força de ataque = ataque × vida/vida máxima
força de defesa = defesa × vida/vida máxima × bônus de defesa
dano causado    = round(força de ataque / (soma das forças) × ataque × 4,5)
revide          = round(força de defesa / (soma das forças) × defesa × 4,5)
```

Bônus de defesa: cidade ×1,5, muralhas ×3, floresta ×1,5 (com Arco e Flecha), montanha ×1,5 (com Escalada), colinas ×1,25, pântano ×0,8, fortificado ×1,25, Piqueiro contra montado ×2.

## Estrutura

```
index.html            página do jogo
css/style.css         interface (HUD, painéis, modais)
js/util.js            RNG com semente e ruído para mapas
js/data.js            regras em dados: terrenos, recursos, tecnologias, unidades, tribos...
js/icons.js           ícones vetoriais (gerado por tools/build-icons.py a partir de tools/icons.json)
js/mapgen.js          geração procedural (biomas por tribo, garantias de justiça)
js/game.js            motor de regras, sem DOM (roda no Node)
js/ai.js              IA: pesquisa, economia, táticas, cerco, navegação e diplomacia
js/render.js          renderizador isométrico em Canvas com animações
js/ui.js              entrada, painéis, modais, fluxo de turnos, passa-e-joga
js/main.js            inicialização
tests/sim.js          partidas IA × IA sem interface para validar regras e IA
```

## Testes

```
npm test              # 6 partidas IA × IA de até 70 turnos, com checagens de integridade e salvar/carregar
node tests/sim.js 20 80
```

O simulador verifica a cada turno a consistência do tabuleiro (grade de unidades, cidades, recursos negativos) e testa que salvar e carregar reproduz o mesmo estado.

## Créditos

Ícones de [game-icons.net](https://game-icons.net), licença [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), pelos autores Lorc, Delapouite, Skoll, Caro Asercion, Cathelineau, Darkzaitzev, Faithtoken, HeavenlyDog e Sbed. Para trocar um ícone, edite `tools/icons.json` e rode `python3 tools/build-icons.py`.
