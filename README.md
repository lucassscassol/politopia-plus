# Chamas de Vardren

Jogo de estratégia por turnos para navegador e celular, com várias camadas de estratégia: ciência separada do dinheiro, recursos estratégicos, promoções, diplomacia com memória, cidades especializadas, organização dos reinos, rotas comerciais de verdade, logística, combate tático, navios, espionagem, eventos mundiais, cinco eras com personagens, seis tipos de vitória, cenários, conquistas, replay e uma IA com objetivos de longo prazo. Em português, inglês e espanhol.

Roda direto no navegador, sem build e sem dependências: HTML, CSS e JavaScript puro, com o mapa desenhado em Canvas isométrico.

## Visual

Fantasia medieval sombria: paleta terrosa e acinzentada, texturas procedurais em cada terreno, luz vinda da esquerda, vegetação diferente por bioma (pinheiros nevados, matas fechadas, acácias da savana, arbustos secos do deserto), cidades de pedra com torre de menagem e estandartes, unidades como escudos heráldicos na cor da tribo, névoa de fumaça no território inexplorado e cinzas flutuando no ar (dá para desligar no menu). Títulos em Cinzel e texto em Alegreya Sans.

## Como jogar

- **Local:** abra `index.html` no navegador, ou sirva a pasta (`npm start` e acesse `http://localhost:8080`).
- **GitHub Pages:** em *Settings → Pages*, publique a branch com a pasta raiz. No celular, use "Adicionar à tela inicial" para jogar em tela cheia.

Controles: toque/clique para selecionar, arraste para mover o mapa, pinça ou roda do mouse para zoom. Atalhos: `Enter` encerra o turno, `N` próxima unidade, `T` tecnologia, `D` diplomacia, `C` cidades, `O` objetivos, `Esc` fecha janelas.

A partida é salva automaticamente no aparelho a cada turno. Saves, opções e conquistas gravados com o nome antigo do jogo (Politopia+) são copiados para o nome novo na primeira abertura. Saves da versão anterior continuam abrindo (são convertidos na hora e mantêm as regras de vitória com que foram criados).

## Sistemas principais

| Sistema | Como funciona aqui |
| --- | --- |
| **Duas moedas** | ★ Estrelas pagam unidades e construções; ⚗ Ciência paga tecnologias. O custo das tecnologias cresce com o número de cidades. Depois da árvore completa, há Tecnologias do Futuro. |
| **Árvore de 34 tecnologias em 5 eras** | Tecnologias das Eras IV e V exigem dois pré-requisitos (ex.: Pólvora = Forja + Matemática). |
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
| **Modos** | Dominação ou Pontos (30/50 turnos), 4 tipos de mapa, 6 tamanhos (14×14 a 40×40), 4 dificuldades e passa-e-joga local para até 6 jogadores. |

## Expansão 2.0

| Sistema | Como funciona |
| --- | --- |
| **Diplomacia profunda** | Paz, pacto de não agressão com prazo, aliança (visão compartilhada, tecnologias −20% quando o aliado já as tem, chamado às armas), comércio de estrelas, ciência, Ferro e Cavalos (por 10 turnos), tributo (exigir ou oferecer) e guerra conjunta. Romper um pacto custa 2 de reputação; trair uma aliança, 3. |
| **Memória diplomática** | Cada tribo lembra guerras declaradas, tratados cumpridos e rompidos, traições (inclusive contra terceiros), comércio, rotas, ajuda militar, cidades tomadas, tributos, espiões pegos e ruínas saqueadas. As lembranças perdem força com o tempo e formam a opinião (Hostil → Amigável). |
| **IA com objetivos** | Dominação, Ciência, Economia, Diplomacia, Territorial e Defesa (emergência). O objetivo é mantido por vários turnos e muda com a situação: força, cidades, território, tecnologia, relações, ameaças e quem está perto de vencer. A IA escolhe alvos e campanhas contra cidades importantes quando tem força. |
| **Cidades especializadas** | Militar, Científica, Comercial, Agrícola e Portuária, com bônus e custos claros, 11 construções exclusivas, marcos nos níveis 6, 8 e 10 e a Metrópole no nível 12. |
| **Rotas comerciais** | Ligam cidades por estrada, porto ou mar; rendem estrelas (e ciência com outras tribos), crescimento e reputação. Unidades inimigas no caminho bloqueiam; ao lado, ameaçam (metade do lucro) — fortificações protegem. Estradas podem ser cortadas e melhorias saqueadas e depois reparadas. |
| **Logística** | Tropas fora do alcance de cidades, território, estradas, portos e fortificações ficam sem suprimentos após um turno (−20%, depois −35% e cura pela metade). Deserto consome em dobro; Cavalos aumentam o raio. |
| **Recursos** | Fontes extras de Ferro e Cavalos barateiam as unidades; Gemas, Especiarias e Baleias (nova Estação baleeira) são luxos que dão lealdade; gemas barateiam maravilhas e especiarias melhoram o comércio exterior. |
| **Combate tático** | Flanco, ataque pelas costas, formação, terreno elevado, emboscada na mata, pântano, linha de visão (montanhas e florestas bloqueiam tiros), ataques de oportunidade e 8 habilidades ativas com recarga (Tiro Preciso, Carga, Provocar, Formação Cerrada, Bombardeio, Bênção, Reconhecimento, Bordada). |
| **Fortificações** | Torre de vigia, Posto avançado, Forte e Fortaleza: visão, detecção de espiões, abastecimento e defesa. Podem ser tomadas ou destruídas. |
| **Naval** | Escuna, Transporte (leva 2 tropas; desembarque anfíbio com −25%), Fragata (caça-navios) e Couraçado (cidades portuárias, Ferro), além do embarque original. |
| **Espionagem** | Espiões furtivos: infiltrar (relatório com tesouro, exército, objetivo e tratados), roubar mapas, ciência ou tecnologia, sabotar produção e estradas. Guarda da Cidade, torres, fortalezas e espiões aumentam o risco. |
| **Névoa com estados** | Não explorado, explorado, visível e inteligência recente (últimos 5 turnos, com as tropas avistadas desenhadas como fantasmas). |
| **Ruínas com escolhas** | Fortaleza, templo, biblioteca, acampamento e túmulo: explorar, saquear, restaurar ou honrar. |
| **Ocupação e lealdade** | Cidades conquistadas ficam ocupadas por 4 turnos e depois se integram ou resistem; revoltas só acontecem com lealdade muito baixa e sem guarnição. |
| **Eventos mundiais** | Grande Seca, Inverno Severo, Corrida do Ouro, Praga, Migração, Descoberta Científica e Tempestades, anunciados 2 turnos antes e com duração conhecida. |
| **Mapas** | Geração em 9 etapas com recursos essenciais travados, validação de justiça (`validateMap`) com regeração automática e pontos estratégicos: passos de montanha, estreitos, pontes antigas, portos naturais, minas abandonadas e ruínas imperiais. |
| **Vitórias** | Dominação e Pontos (originais) + Científica (Grande Observatório), Econômica, Maravilhas, Territorial e Diplomática; cada uma pode ser desligada na criação. |
| **Cenários** | Guerra dos Dois Continentes, Ilhas, Mundo Hostil, Guerra Total, Era do Ferro, Corrida Científica e O Último Reino. |
| **Pós-jogo** | Estatísticas completas, 25 conquistas com progresso (guardadas no aparelho) e replay por rodada. |

## Expansão 2.1: reinos, Era V e personagens

| Sistema | Como funciona |
| --- | --- |
| **Mapas maiores** | Além de Pequeno a Enorme, **Colossal (32×32)** e **Titânico (40×40)**. Nos mapas grandes os impérios passam de 15 cidades e a organização faz diferença. O custo do Grande Observatório cresce com a área do mapa (expoente 1,5), para a vitória científica não dominar os mapas gigantes. |
| **Capacidade administrativa** | Cada reino governa bem 4 cidades, mais Organização, Escrita, Código de Leis e Burocracia, Tribunais, Casas da Imprensa, Paços Regionais, a Chancelaria e o Governador. Cada cidade além disso causa desordem: −5% das estrelas e da ciência das cidades (máx. −25%). |
| **Alcance da corte** | Capital alcança 7 casas (9 com Chancelaria), Paço Regional 5 e a cidade do Governador 4; estrada ou porto até a capital encurta 2. Fora do alcance a cidade rende 20% menos (10% com Tribunal) e, se conquistada, perde lealdade. |
| **Construções do reino** | Tribunal (Código de Leis, nova tecnologia da Era III), Chancelaria (só na capital), Paço Regional (sede de província, alcance 5, +5 de lealdade na província), Embaixada (uma por reino), Academia Militar, Fundição Real e Casa da Imprensa. |
| **Era V · Impérios** | Burocracia, Diplomacia Real, Arte da Guerra, Siderurgia e Imprensa; unidades Dragão (atirador montado, Cavalos) e Morteiro (artilharia, Ferro). |
| **Personagens** | Um de cada por reino, com nome próprio gerado pela língua da tribo e uma estrela dourada no mapa: **General** (+20% de ataque e +10% de defesa às tropas vizinhas), **Governador** (dentro ou ao lado de uma cidade, faz dela um centro administrativo: +2★, +10 de lealdade, +1 de capacidade) e **Embaixador** (no território de uma tribo em paz: +2 de opinião por turno e relatório da tribo). Não ocupam vaga nas cidades e não podem ser convertidos. |
| **IA** | Pesquisa a Era V, prioriza as tecnologias de organização quando está em desordem, constrói Tribunais e Paços onde faltam, recruta personagens e os posiciona: o General acompanha o exército, o Governador vai para as cidades longe da corte e o Embaixador visita quem tem pior opinião. |

A organização do reino pode ser desligada na criação da partida. Partidas criadas antes desta versão não têm desordem nem distância, mas ganham a Era V, as construções e os personagens.

### Tribos

| Tribo | Começa com | Vantagem | Mecânica única (2.0) |
| --- | --- | --- | --- |
| 🦙 Aymará | Escalada + Mineração | Minas e Garimpos dão +1 população | Montanhas custam 1 e dão +1 de visão; Terraços em colinas |
| 🦜 Tupinás | Caça | Florestas custam 1 de movimento e sempre dão defesa | Furtivos na mata; emboscada +40% |
| 🐺 Vikar | Pesca | Embarcações +1 movimento; pescar dá +1 população | Embarcam de qualquer costa; saque litorâneo em dobro |
| 🐪 Qadir | Montaria (Cavaleiro Leve) | Capital +2★; cidades conectadas +1★ | +1 vaga de rota na capital; comércio melhora relações em dobro |
| 🐉 Han-Lu | Organização | Tecnologias 15% mais baratas | Tecnologias já conhecidas por tribos encontradas −20%; cidades científicas sem perda de capacidade |
| 🦁 Zambé | Caça + guerreiro extra | XP em dobro e cura +2 | Cura 3 ao abater; veteranos inspiram vizinhos (+10%) |

### Combate

Fórmula base:

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
js/i18n.js            idiomas: PP.t (textos), PP.num (decimais) e PP.applyLanguage (camada sobre os dados)
js/lang/en.js         inglês: dicionário da interface e textos das regras
js/lang/es.js         espanhol: dicionário da interface e textos das regras
js/data.js            regras em dados: terrenos, recursos, tecnologias, unidades, construções, especializações, tribos...
js/icons.js           ícones vetoriais (gerado por tools/build-icons.py a partir de tools/icons.json)
js/mapgen.js          geração procedural em 9 etapas + validateMap e regeração
js/game.js            núcleo do motor (sem DOM, roda no Node) e registro de sistemas com ganchos
js/diplomacy.js       relações, tratados, propostas, comércio, tributo, guerra conjunta e memória
js/cities.js          especialização, marcos, metrópole, crescimento, ocupação, lealdade e revolta
js/economy.js         renda, conexões, recursos, rotas comerciais, saque/reparo, fortificações e logística
js/combat.js          modificadores táticos, linha de visão, ataques de oportunidade e habilidades ativas
js/naval.js           portos, navios, transporte, embarque e desembarque
js/espionage.js       furtividade, detecção e missões de espionagem
js/intel.js           névoa com estados e inteligência recente
js/events.js          eventos mundiais
js/ruins.js           ruínas com escolhas
js/victory.js         condições de vitória e progresso
js/stats.js           estatísticas completas
js/achievements.js    conquistas
js/replay.js          quadros do replay
js/scenarios.js       cenários
js/realm.js           organização do reino (capacidade, alcance da corte), construções da Era V e personagens
js/ai-strategy.js     objetivos da IA, análise, propostas e iniciativas diplomáticas
js/ai.js              IA tática: pesquisa, economia, unidades, cerco, navegação (com pontos de extensão AI.ext)
js/ai-realm.js        IA da organização do reino, da Era V e dos personagens
js/render.js          renderizador isométrico em Canvas com animações
js/ui.js              entrada, painéis, modais, fluxo de turnos, passa-e-joga
js/ui-screens.js      telas dos sistemas novos (objetivos, comércio, espionagem, replay, conquistas...)
js/ui-realm.js        administração e personagens na cidade, resumo do reino e avisos
js/main.js            inicialização
tests/load.js         carrega o motor no Node na mesma ordem do index.html
tests/systems.js      testes de cada sistema (diplomacia, rotas, combate, naval, reino, personagens, saves antigos...)
tests/sim.js          partidas IA × IA com checagens de integridade e salvar/carregar
tests/balance.js      simulações de balanceamento com todas as vitórias e cenários
tests/i18n.js         cobertura dos idiomas e partida idêntica em qualquer idioma
tests/i18n-keys.js    coleta as chaves de texto do código e do index.html
tests/i18n-data.js    lista os textos das regras que cada idioma traduz
tests/fixtures/       saves da versão 1 usados no teste de compatibilidade
```

### Arquitetura

O núcleo (`game.js`) cuida de mapa, unidades, cidades, turnos e salvamento. Cada sistema novo é um módulo que adiciona métodos ao `PP.Game.prototype` e se registra com `PP.registerSystem(nome, ganchos)`. O núcleo chama os ganchos (`init`, `load`, `save`, `beforeTurn`, `income`, `newRound`, `capture`, `unitKilled`, `war`, `treaty`...) e os pontos de extensão opcionais (`statMods`, `combatMods`, `defenseMods`, `capacityBonus`, `unitCost`...). O save (versão 2) guarda o estado de cada sistema num bloco `sys`; saves da versão 1 recebem valores padrão ao carregar.

### Idiomas

O jogo vem em português (padrão), inglês e espanhol; o idioma é escolhido no menu principal ou no Menu da partida e fica salvo no aparelho. O português é o texto-fonte: todo texto visível passa por `PP.t('texto em português', { variáveis })`, que devolve a tradução do idioma ativo (variáveis entram como `{nome}`). Os textos das regras (unidades, tecnologias, construções, eventos, conquistas...) são traduzidos por caminho a partir de `PP` (ex.: `'UNITS.warrior.name'`) em `PP.I18N_DATA`, e `PP.applyLanguage` troca esses textos guardando os originais. Para adicionar um idioma, crie `js/lang/xx.js` com `PP.I18N.xx` e `PP.I18N_DATA.xx`, inclua-o em `PP.LANGS`, no `index.html` e em `tests/load.js`; `node tests/i18n.js` aponta tudo o que faltar. Ao escrever um texto novo no código, use `PP.t` e acrescente a tradução nos dois arquivos — o teste falha se faltar.

O idioma não altera a jogabilidade (o teste joga a mesma partida nos três idiomas e compara o resultado). Entradas da Crônica já registradas continuam no idioma em que foram escritas; nomes de tribos e cidades são nomes próprios e não mudam.

## Testes

```
npm test                    # testes dos sistemas + idiomas + 8 partidas IA × IA de até 70 turnos
npm run balance             # 12 partidas com todas as vitórias e cenários, com estatísticas
node tests/systems.js       # só os testes de sistemas (ONLY=texto filtra pelo nome)
node tests/sim.js 20 80
```

O simulador verifica a cada turno a consistência do tabuleiro (grade de unidades, cidades, recursos negativos, cargas de transporte, rotas, fortificações, lealdade) e testa que salvar e carregar reproduz o mesmo estado. Os testes de sistemas incluem saves da versão 1, cenários, validação de mapas e determinismo (uma partida recarregada continua idêntica).

## Créditos

Ícones de [game-icons.net](https://game-icons.net), licença [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), pelos autores Lorc, Delapouite, Skoll, Caro Asercion, Cathelineau, Darkzaitzev, Faithtoken, HeavenlyDog e Sbed. Para trocar um ícone, edite `tools/icons.json` e rode `python3 tools/build-icons.py`.
