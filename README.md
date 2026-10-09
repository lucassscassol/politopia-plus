# Chamas de Vardren

Jogo de estratégia por turnos para navegador e celular, com várias camadas de estratégia: ciência separada do dinheiro, recursos estratégicos, promoções, diplomacia com memória, vassalos e termos de paz, formas de governo, impostos e empréstimos, cidades especializadas, organização dos reinos, rotas comerciais de verdade, logística, combate tático, navios, espionagem, eventos mundiais, cinco eras com personagens, seis tipos de vitória, cenários, conquistas, replay e uma IA com objetivos de longo prazo. Em português, inglês e espanhol.

Roda direto no navegador, sem build e sem dependências: HTML, CSS e JavaScript puro, com o mapa desenhado em Canvas isométrico.

## Visual

Fantasia medieval sombria: paleta terrosa e acinzentada, texturas procedurais em cada terreno, luz vinda da esquerda, vegetação diferente por bioma (pinheiros nevados, matas fechadas, acácias da savana, arbustos secos do deserto), cidades de pedra com torre de menagem e estandartes, unidades como escudos heráldicos na cor da tribo, névoa de fumaça no território inexplorado e cinzas flutuando no ar (dá para desligar no menu). Títulos em Cinzel e texto em Alegreya Sans.

## Como jogar

- **Local:** abra `index.html` no navegador, ou sirva a pasta (`npm start` e acesse `http://localhost:8080`).
- **GitHub Pages:** em *Settings → Pages*, publique a branch com a pasta raiz. No celular, use "Adicionar à tela inicial" para jogar em tela cheia.
- **Android:** baixe e instale [`apk/ChamasDeVardren-2.3.0.apk`](https://github.com/lucassscassol/politopia-plus/raw/claude/lucid-gauss-64jsit/apk/ChamasDeVardren-2.3.0.apk) (ou gere com `tools/build-apk.sh`; veja [Android (APK)](#android-apk)). Funciona sem internet.

Controles: toque/clique para selecionar, arraste para mover o mapa, pinça ou roda do mouse para zoom. Atalhos: `Enter` encerra o turno, `N` próxima unidade, `T` tecnologia, `D` diplomacia, `C` cidades, `R` reino, `O` objetivos, `Esc` fecha janelas.

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

## Som (2.2)

Todo o som é sintetizado pelo próprio jogo (`js/audio.js`), sem arquivos de áudio: o APK continua pequeno e não há licenças de terceiros.

- **Efeitos:** espadas, arcos, mosquetes, catapultas, canhões, passos, cascos, remos, marteladas de obra, moedas, sinos de cidade fundada e de turno, trompas de conquista e de promoção, tambores de guerra, harpa de tecnologia, coro de maravilha, gongo dos eventos mundiais e fanfarras de vitória e derrota (47 sons, a maioria com 2 ou 3 variações). Cada som acompanha a animação (o golpe soa quando a tropa acerta), vem do lado da tela onde a ação acontece e só toca para o que você enxerga.
- **Música:** composta enquanto toca, em ré menor: bordão grave, alaúde em arpejos e melodias e tambor de moldura. Muda de progressão e textura a cada 4 compassos e fica mais marcada (tambor em pulso) enquanto houver combate envolvendo você.
- **Opções:** liga/desliga de efeitos e música no menu principal; no Menu da partida, volume Desligado, Baixo, Médio ou Alto para cada um (guardado no aparelho). O som começa no primeiro toque (regra dos navegadores) e para quando o app ou a aba vai para o fundo; no Android, os botões de volume controlam o som do jogo.

## Expansão 2.3: coroa e tesouro

Mecânicas inspiradas em *Age of History* (formas de governo, impostos, empréstimos, vassalos, termos de paz cobrados pelo placar da guerra e trégua), adaptadas ao tabuleiro e aos turnos curtos daqui. A anarquia na troca de governo é uma adaptação nossa, para que a escolha tenha custo. Tudo fica na nova tela **Reino** (botão na barra lateral ou tecla `R`) e na tela de Diplomacia.

| Sistema | Como funciona |
| --- | --- |
| **Formas de governo** | **Chefia Tribal** (a inicial, sem efeitos). **Monarquia** (Organização): +1 de capacidade administrativa, +5 de lealdade, +2★ na capital, −10% de ciência. **Teocracia** (Meditação): +10 de lealdade, cada Templo rende +1★, Missionários 2★ mais baratos, −15% de ciência. **Feudalismo** (Estratégia): muralhas e fortificações pela metade do preço, tropas fortificadas +15% de defesa, vassalos pagam 25% de tributo, −10% de estrelas. **República** (Comércio): +10% de ciência e +1★ por rota comercial ativa, mas com cansaço de guerra (−20% de estrelas e −5 de lealdade enquanto houver guerra ativa). **Império** (Burocracia, 6 cidades, ou 8 nos mapas maiores que 18×18, e uma capital estrangeira ou dois vassalos): +2 de capacidade, +10% de estrelas, cidades conquistadas ficam ocupadas só 2 turnos, vassalos pagam 20%. |
| **Anarquia** | Trocar de governo custa 2 turnos de anarquia (1 para proclamar o Império): metade das estrelas e da ciência das cidades, −10 de lealdade e nenhum efeito de governo. Depois de uma troca, a próxima só em 10 turnos. |
| **Impostos** | São o orçamento do reino e mudam quando você quiser, no seu turno: **baixos** (−20% de estrelas, +10% de ciência, +10 de lealdade e +1 de população por cidade a cada 6 turnos), **normais**, **altos** (+20% de estrelas, −25% de ciência, −10 de lealdade) e **extorsivos** (+40% de estrelas, −50% de ciência, −20 de lealdade e −1 de capacidade). |
| **Empréstimos** | Com Comércio: **pequeno** (3× a renda, de 10 a 60★, 20% de juros em 6 parcelas) ou **grande** (6× a renda, de 20 a 120★, 35% em 10 parcelas); um Banco tira 10 pontos dos juros. As parcelas são cobradas no começo do turno e dá para quitar antes. Parcela atrasada acrescenta 10% do que faltou; três atrasos seguidos são **calote**: a dívida some, mas a reputação cai 2, o governo entra em anarquia e o crédito fica suspenso por 20 turnos. |
| **Placar da guerra** | Cada guerra soma pontos para cada lado: tropa derrotada 1, personagem 3, cidade tomada 4, capital 8, saque 1. A Diplomacia mostra o placar. |
| **Termos de paz** | Quem está ganhando pode exigir, em troca da paz: **reparações** (1 a 6★ por turno durante 8 turnos), a **cessão de uma cidade** (nunca a capital nem a última) ou a **vassalagem**. A tela de termos avisa se a proposta é provável ou improvável. A IA também exige termos quando ganha. |
| **Trégua** | Toda paz abre 10 turnos de trégua; rompê-la custa 2 de reputação, como romper um pacto, e a IA quase nunca rompe. |
| **Vassalos** | Ficam aliados do suserano (visão compartilhada), pagam 15% da renda em estrelas como tributo, entram nas guerras dele e não declaram guerra, nem fazem alianças, nem negociam a paz de uma guerra do suserano sozinhos. Uma tribo fraca e amiga pode aceitar a sua **proteção** em tempos de paz. |
| **Anexação e independência** | Depois de 10 turnos de vassalagem e com boa relação, o suserano pode propor a **anexação** (8★ por cidade): cidades, tropas e o tesouro do vassalo passam para ele. Ele também pode **libertar** o vassalo, que fica grato. O vassalo pode **declarar independência** a qualquer momento: vira guerra, e os aliados do suserano são chamados. |
| **Dominação por vassalos** | Quem mantém todos os rivais vivos como seus vassalos por 5 turnos vence por Dominação. Vassalos não vencem pela Diplomacia, e cada vassalo vale +100 pontos. |
| **IA** | Escolhe o governo pela situação e pela estratégia (República para a ciência e o comércio, Feudalismo para a defesa, Monarquia quando o reino passa da capacidade, Império assim que puder) e não troca sob cerco; revê os impostos a cada 3 turnos; pede empréstimo só na emergência e quita quando sobra; exige termos quando ganha (o conquistador segue a guerra, a não ser para fazer um vassalo); oferece proteção a tribos fracas; anexa vassalos leais; e os vassalos se rebelam quando ficam fortes ou ressentidos. |
| **Conquistas** | Coroação, Reformador, Suserano e Anexação Pacífica (29 no total). |

Partidas antigas começam com Chefia Tribal, impostos normais e sem vassalos, o que não muda nada nelas.

## Regras de referência

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
js/government.js      formas de governo, anarquia, impostos e empréstimos
js/vassals.js         placar da guerra, termos de paz, trégua, vassalos, anexação e dominação por vassalos
js/ai-strategy.js     objetivos da IA, análise, propostas e iniciativas diplomáticas
js/ai.js              IA tática: pesquisa, economia, unidades, cerco, navegação (com pontos de extensão AI.ext)
js/ai-realm.js        IA da organização do reino, da Era V e dos personagens
js/ai-crown.js        IA do governo, dos impostos, dos empréstimos, dos termos de paz e dos vassalos
js/render.js          renderizador isométrico em Canvas com animações
js/ui.js              entrada, painéis, modais, fluxo de turnos, passa-e-joga
js/ui-screens.js      telas dos sistemas novos (objetivos, comércio, espionagem, replay, conquistas...)
js/ui-realm.js        administração e personagens na cidade, resumo do reino e avisos
js/ui-crown.js        tela Reino (governo, impostos, tesouro, empréstimos, vassalos), termos de paz e ações na Diplomacia
js/audio.js           som: síntese dos efeitos, música generativa e motor Web Audio (a síntese roda no Node)
js/ui-audio.js        som na interface: eventos da partida → efeitos, cliques, opções de volume
js/main.js            inicialização
apk/                  APK pronto para instalar
android/              app Android: manifesto, MainActivity (WebView), ícones, fontes locais e a chave de desenvolvimento
tools/build-apk.sh    gera o APK sem Gradle (ferramentas Android do Ubuntu)
tools/android-icons.js  gera os ícones do app a partir de assets/icon.svg (Playwright)
tests/load.js         carrega o motor no Node na mesma ordem do index.html
tests/systems.js      testes de cada sistema (diplomacia, rotas, combate, naval, reino, personagens, governo, empréstimos, vassalos, saves antigos...)
tests/sim.js          partidas IA × IA com checagens de integridade e salvar/carregar
tests/balance.js      simulações de balanceamento com todas as vitórias e cenários
tests/i18n.js         cobertura dos idiomas e partida idêntica em qualquer idioma
tests/audio.js        todos os efeitos sintetizados (sem NaN, estouro, DC ou estalos), afinação das notas e escala da música
tests/i18n-keys.js    coleta as chaves de texto do código e do index.html
tests/i18n-data.js    lista os textos das regras que cada idioma traduz
tests/fixtures/       saves da versão 1 usados no teste de compatibilidade
```

### Arquitetura

O núcleo (`game.js`) cuida de mapa, unidades, cidades, turnos e salvamento. Cada sistema novo é um módulo que adiciona métodos ao `PP.Game.prototype` e se registra com `PP.registerSystem(nome, ganchos)`. O núcleo chama os ganchos (`init`, `load`, `save`, `beforeTurn`, `income`, `newRound`, `capture`, `unitKilled`, `war`, `treaty`...) e os pontos de extensão opcionais (`statMods`, `combatMods`, `defenseMods`, `capacityBonus`, `unitCost`...). O save (versão 2) guarda o estado de cada sistema num bloco `sys`; saves da versão 1 recebem valores padrão ao carregar.

### Idiomas

O jogo vem em português (padrão), inglês e espanhol; o idioma é escolhido no menu principal ou no Menu da partida e fica salvo no aparelho. O português é o texto-fonte: todo texto visível passa por `PP.t('texto em português', { variáveis })`, que devolve a tradução do idioma ativo (variáveis entram como `{nome}`). Os textos das regras (unidades, tecnologias, construções, eventos, conquistas...) são traduzidos por caminho a partir de `PP` (ex.: `'UNITS.warrior.name'`) em `PP.I18N_DATA`, e `PP.applyLanguage` troca esses textos guardando os originais. Para adicionar um idioma, crie `js/lang/xx.js` com `PP.I18N.xx` e `PP.I18N_DATA.xx`, inclua-o em `PP.LANGS`, no `index.html` e em `tests/load.js`; `node tests/i18n.js` aponta tudo o que faltar. Ao escrever um texto novo no código, use `PP.t` e acrescente a tradução nos dois arquivos — o teste falha se faltar.

O idioma não altera a jogabilidade (o teste joga a mesma partida nos três idiomas e compara o resultado). Entradas da Crônica já registradas continuam no idioma em que foram escritas; nomes de tribos e cidades são nomes próprios e não mudam.

## Android (APK)

O APK é uma casca nativa mínima: uma `WebView` em tela cheia (`android/src/.../MainActivity.java`) que roda os mesmos arquivos da versão web, empacotados dentro do app. Nada é baixado: as fontes Cinzel e Alegreya Sans vão junto (`android/fonts/`), e os arquivos são servidos em `https://appassets.androidplatform.net/`, uma origem fixa do próprio app, para que o salvamento automático (localStorage) persista entre aberturas. O botão voltar do Android fecha a janela aberta, depois a seleção, depois abre o Menu da partida; no menu principal, manda o app para o fundo. Ao sair do app no seu turno, a partida é gravada na hora.

```
sudo apt-get install aapt apksigner zipalign dalvik-exchange android-sdk-platform-23 openjdk-17-jdk-headless
tools/build-apk.sh          # → dist/ChamasDeVardren-<versão>.apk (versão e versionCode vêm do package.json)
```

O build não usa Gradle nem o SDK do Google, só as ferramentas Android empacotadas no Ubuntu/Debian; Android 5.0 (API 21) ou mais novo. O APK sai assinado com `android/vardren-debug.keystore` (senha `vardren`), uma chave de desenvolvimento **pública**: ela serve para que cada versão nova instale por cima da anterior sem apagar as partidas salvas, mas não protege nada e não serve para a Play Store. Para publicar na loja, gere uma chave própria e guarde-a fora do repositório (`VARDREN_KEYSTORE=... VARDREN_KEY_ALIAS=... VARDREN_KEY_PASS=... tools/build-apk.sh`); a loja também pede o formato AAB, que este script não gera. Trocar de chave obriga a desinstalar a versão antiga, o que apaga as partidas salvas no aparelho.

Para instalar no celular: copie o APK, abra-o e permita "instalar apps desconhecidos" para o app que abriu o arquivo (navegador ou gerenciador de arquivos).

## Testes

```
npm test                    # testes dos sistemas + idiomas + som + 8 partidas IA × IA de até 70 turnos
npm run balance             # 12 partidas com todas as vitórias e cenários, com estatísticas
node tests/systems.js       # só os testes de sistemas (ONLY=texto filtra pelo nome)
node tests/sim.js 20 80
```

O simulador verifica a cada turno a consistência do tabuleiro (grade de unidades, cidades, recursos negativos, cargas de transporte, rotas, fortificações, lealdade, governos, impostos e empréstimos válidos, vassalos só de tribos vivas e sempre aliados, nenhuma tribo viva sem cidades) e testa que salvar e carregar reproduz o mesmo estado. Os testes de sistemas incluem saves da versão 1, cenários, validação de mapas e determinismo (uma partida recarregada continua idêntica).

## Créditos

Ícones de [game-icons.net](https://game-icons.net), licença [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), pelos autores Lorc, Delapouite, Skoll, Caro Asercion, Cathelineau, Darkzaitzev, Faithtoken, HeavenlyDog e Sbed. Para trocar um ícone, edite `tools/icons.json` e rode `python3 tools/build-icons.py`.

Fontes [Cinzel](https://github.com/NDISCOVER/Cinzel) e [Alegreya Sans](https://github.com/huertatipografica/Alegreya-Sans), licença SIL Open Font License 1.1 (cópias das licenças em `android/fonts/`, empacotadas no APK).
