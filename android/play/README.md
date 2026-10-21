# Chamas de Vardren — app da Google Play

Este projeto Gradle gera o **Android App Bundle (.aab)** que vai para a Play Store. Ele empacota o mesmo jogo da
versão web e soma o que o APK avulso não tem:

- **Loja** (Google Play Billing 9.1): tribos Kemet, Tarkhan e Ériu, o pacote das três e "Sem anúncios". São
  produtos de compra única, presos à conta Google Play do jogador. O app consulta a conta a cada abertura e ao
  voltar para o jogo, então a compra continua valendo depois de reinstalar ou num aparelho novo. O botão
  *Restaurar compras* força a consulta, e uma compra reembolsada deixa de valer.
- **Anúncios** (AdMob 25.4 + UMP 4.0): o formulário de consentimento aparece quando a lei exige e antes de
  qualquer anúncio. Há anúncio de tela cheia só entre partidas e um vídeo premiado opcional no Tesouro.

A ponte com o jogo é `window.VardrenNative`, descrita no topo de `js/store.js`. O código nativo está em
`app/src/main/java/.../PlayActivity.java` e `PlayServices.java`. A `MainActivity`, os ícones e o tema vêm de
`android/src` e `android/res`, compartilhados com o APK avulso.

> **Atenção: este projeto ainda não foi compilado.** No ambiente onde foi escrito, o repositório de bibliotecas
> do Google (dl.google.com, onde ficam o Android Gradle Plugin, a Billing, o AdMob e o UMP) estava bloqueado.
> O Java foi conferido com o compilador contra as assinaturas oficiais das bibliotecas, menos os trechos das
> APIs 30 e 33 (botão voltar e barras do sistema). O build Gradle em si nunca rodou. Na primeira compilação no
> Android Studio pode ser preciso algum ajuste pequeno de versão ou de API.

## Requisitos

- Android Studio atualizado (ou JDK 17+ com o Android SDK 36 instalado).
- `bash` e `python3` no PATH. A tarefa `stageWww` roda `tools/stage-www.sh`; no Windows, use o Git Bash ou o WSL.
- Exigências atuais da Play, já atendidas aqui: API alvo 36 (desde 31/08/2026) e Billing Library 8 ou mais nova.

## Testar (debug)

```bash
cd android/play
./gradlew installDebug        # ou abra a pasta android/play no Android Studio e toque em Run
```

O debug usa os **IDs de teste do AdMob**, que mostram anúncios de teste, sem receita e sem risco para a conta.
Para as **compras** funcionarem, a Play precisa conhecer o app:

1. Envie um `.aab` de release para a faixa de **teste interno**.
2. Cadastre sua conta Google em *Configurações → Teste de licença*.
3. Instale pela Play, pelo link do teste interno. As contas de teste compram sem cobrança.

## Configurar a versão da loja

Copie `secrets.properties.example` para `secrets.properties`, que fica fora do git. Você também pode passar os
valores como `-Pchave=valor`, em `~/.gradle/gradle.properties` ou como variáveis de ambiente
(`VARDREN_ADMOB_APPID`, `VARDREN_UPLOAD_STOREFILE`...):

| Chave | De onde vem |
|---|---|
| `vardren.admob.appId` | AdMob → Apps → seu app (`ca-app-pub-…~…`) |
| `vardren.admob.interstitial` / `vardren.admob.rewarded` | AdMob → blocos de anúncio "Intersticial" e "Premiado" |
| `vardren.play.licenseKey` | Play Console → Monetizar com o Play → Configuração da monetização → Licenciamento |
| `vardren.upload.*` | Sua chave de upload (veja abaixo) |

O `bundleRelease` **se recusa a rodar** sem os IDs reais do AdMob, com IDs de teste ou sem a chave de upload.

### Chave de upload

Crie a chave fora do repositório e guarde a senha num gerenciador de senhas:

```bash
keytool -genkeypair -v -keystore ~/vardren-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Ative a **Assinatura de apps do Google Play** ao criar o app no Play Console: o Google guarda a chave final, e se a
chave de upload for perdida dá para trocá-la. Nunca use `android/vardren-debug.keystore`, que é pública.

### Gerar o bundle

```bash
cd android/play
./gradlew bundleRelease
# → app/build/outputs/bundle/release/app-release.aab
```

`versionCode` e `versionName` saem do `package.json` (2.5.0 → 20500), com a mesma regra do APK avulso.

## Produtos no Play Console

Crie em *Monetizar com o Play → Produtos → Produtos de compra única*, com estes IDs exatos (os mesmos de
`js/store.js` e `PlayServices.PRODUCTS`):

| ID | O que libera | Preço sugerido |
|---|---|---|
| `tribe_kemet` | Kemet | R$ 4,99 |
| `tribe_tarkhan` | Tarkhan | R$ 4,99 |
| `tribe_eriu` | Ériu | R$ 4,99 |
| `tribes_bundle` | as três tribos | R$ 9,99 |
| `remove_ads` | tira os anúncios de tela cheia | R$ 7,99 |

São não consumíveis: o app reconhece (acknowledge) cada compra e nunca as consome.

## AdMob

1. Crie o app no AdMob, ligado ao app da Play, e os dois blocos: Intersticial e Premiado.
2. Em *Privacidade e mensagens*, publique a mensagem de consentimento (GDPR/Europa e estados dos EUA). Sem ela,
   o UMP não mostra o formulário e os anúncios na Europa ficam limitados.
3. Publique um `app-ads.txt` no site de desenvolvedor informado na Play. Veja `store/app-ads.txt`.

## Segurança: o que esta versão faz e o que não faz

- A posse das tribos vem da Play Store, não do aparelho. O jogo só guarda uma cópia para abrir sem internet, e
  a resposta da Play sempre substitui essa cópia.
- Com `vardren.play.licenseKey`, a assinatura de cada compra é conferida no aparelho. Isso barra apps de
  "compra grátis", mas não um APK modificado. A proteção completa exige um servidor próprio que valide o
  `purchaseToken` na Google Play Developer API, e este jogo não tem servidor.
- O jogo é JavaScript aberto e o repositório é público. Quem quiser pode compilar uma cópia sem as travas, e um
  jogo offline não tem como impedir isso. Se isso importar, deixe o repositório privado.
