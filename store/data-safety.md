# Play Console: Segurança dos dados, classificação e público-alvo

As respostas abaixo valem para o app da Play (`android/play`), que usa Google Mobile Ads (AdMob), UMP e
Google Play Billing. O jogo em si não coleta nada. Antes de enviar o formulário, confira a página oficial
"Google Mobile Ads SDK: divulgação de dados" (AdMob → Ajuda → Política → Segurança dos dados), porque o Google
pode mudar o que o SDK coleta.

## Segurança dos dados (Política do app → Segurança dos dados)

- **O app coleta ou compartilha algum dos tipos de dados exigidos?** Sim (por causa do AdMob).
- **Os dados são criptografados em trânsito?** Sim (o SDK usa HTTPS).
- **Os usuários podem pedir a exclusão dos dados?** O app não tem conta nem servidor. Os dados de publicidade
  seguem as ferramentas do Google (redefinir ou excluir o ID de publicidade). Responda conforme a orientação
  atual do formulário.

| Tipo de dado (Play) | Coletado | Compartilhado | Finalidade | Opcional? |
|---|---|---|---|---|
| Local → Local aproximado (pelo IP) | Sim | Sim (Google) | Publicidade, análise, prevenção de fraudes | Não |
| Atividade no app → Interações no app | Sim | Sim (Google) | Publicidade, análise | Não |
| Informações e desempenho do app → Registros de falhas, Diagnóstico | Sim | Sim (Google) | Análise, prevenção de fraudes | Não |
| IDs do dispositivo ou outros IDs (ID de publicidade) | Sim | Sim (Google) | Publicidade, análise, prevenção de fraudes | Não |

**Compras:** o pagamento é processado pela Google Play, e o app só recebe a confirmação da compra. Siga a
orientação do formulário sobre dados tratados pelo Google Play Billing; em geral, eles não precisam ser
declarados pelo desenvolvedor.

## Outras declarações

- **Anúncios:** o app contém anúncios → **Sim**.
- **ID de publicidade:** o app usa o ID de publicidade → **Sim**, para publicidade e análise. A permissão
  `AD_ID` vem com o SDK do AdMob.
- **Compras no app:** Sim (produtos de compra única).
- **Acesso ao app:** todo o jogo funciona sem login. Não há credenciais a informar.
- **Política de Privacidade:** a URL pública de `store/privacy.html`, depois de preencher os campos entre
  colchetes.

## Público-alvo e conteúdo

- **Faixa etária-alvo:** 13 a 15, 16 a 17 e 18+. Não marque menores de 13: isso colocaria o app na política de
  Famílias, que exige anúncios para crianças e SDKs certificados.
- **O app atrai crianças?** Não. O visual é estilizado, mas a estratégia e os textos são para adolescentes e
  adultos.

## Classificação indicativa (questionário IARC)

- **Categoria:** Jogo → Estratégia.
- **Violência:** combate entre unidades estilizadas (ícones), sem sangue, sem morte realista, sem violência
  contra pessoas reais → violência fantasiosa/leve.
- **Sem:** conteúdo sexual, linguagem imprópria, drogas, jogos de azar ou apostas, compartilhamento de
  localização, interação entre usuários online.
- **Compras digitais:** Sim. **Anúncios:** Sim.
- O resultado esperado fica perto de Livre/10 anos no Brasil, PEGI 7 e ESRB E10+, mas quem decide é o
  questionário.
