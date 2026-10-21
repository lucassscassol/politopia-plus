# Publicar na Play Store: passo a passo

Siga a ordem: cada etapa depende da anterior. Os prazos e as regras da Play mudam; confira no Play Console.

## 1. Contas

- [ ] **Conta de desenvolvedor Google Play** (play.google.com/console), com taxa única de US$ 25 e verificação de
      identidade. Contas pessoais novas precisam de um **teste fechado com pelo menos 12 testadores por 14 dias
      seguidos** antes de pedir acesso à produção.
- [ ] **Conta AdMob** (admob.google.com), com dados de pagamento e impostos preenchidos.
- [ ] **Perfil de pagamentos** no Play Console, para vender as tribos. Pode pedir dados fiscais.

## 2. Preparar o projeto

- [ ] Leia `android/play/README.md`.
- [ ] Gere a chave de upload (`keytool`, fora do repositório) e guarde a senha.
- [ ] Crie o app no AdMob e os blocos Intersticial e Premiado; preencha `android/play/secrets.properties`.
- [ ] Publique a mensagem de consentimento no AdMob (Privacidade e mensagens → GDPR e estados dos EUA).
- [ ] Preencha os colchetes de `store/privacy.html` e publique a página numa URL pública. Exemplo: ative o
      GitHub Pages do repositório e use `https://<usuário>.github.io/<repo>/store/privacy.html`.
- [ ] Publique `store/app-ads.txt` (com o seu `pub-…`) na raiz do site de desenvolvedor.

## 3. Primeira compilação

- [ ] Abra `android/play` no Android Studio e rode o debug num celular: menu, loja (preços aparecem só depois
      do passo 5), anúncios de teste entre partidas e o vídeo premiado no Tesouro.
- [ ] `./gradlew bundleRelease` gera `app/build/outputs/bundle/release/app-release.aab`.

## 4. Criar o app no Play Console

- [ ] Nome "Chamas de Vardren", jogo, gratuito. Ative a **Assinatura de apps do Google Play**.
- [ ] Ficha da loja: textos em `store/listing-*.md`, ícone, gráfico de destaque e capturas em `store/graphics/`.
- [ ] Política do app: privacidade (URL), anúncios = sim, segurança dos dados, público-alvo e classificação
      (`store/data-safety.md`).

## 5. Produtos e testes

- [ ] Envie o `.aab` para o **teste interno**.
- [ ] Crie os 5 produtos de compra única com os IDs de `android/play/README.md` e ative-os.
- [ ] Cadastre as contas de teste em *Teste de licença*. Instale pela Play e teste: comprar, pagamento
      pendente, cancelar, restaurar depois de reinstalar, reembolso (a tribo deve travar de novo) e o pacote.
- [ ] Teste o formulário de consentimento com uma VPN ou um aparelho na Europa (ou com as opções de depuração do
      UMP).

## 6. Teste fechado e produção

- [ ] Teste fechado com 12 ou mais testadores por 14 dias (contas pessoais novas).
- [ ] Peça acesso à produção, envie para revisão e lance (de preferência em lançamento gradual).

## Depois do lançamento

- A cada versão nova: aumente a versão no `package.json` (o `versionCode` sobe junto) e rode `npm test` e
  `./gradlew bundleRelease`.
- Quem instalou o APK avulso (assinado com a chave de desenvolvimento pública) **não consegue atualizar pela
  Play**: o Android recusa a troca de assinatura. É preciso desinstalar, e as partidas salvas desse app se
  perdem.
