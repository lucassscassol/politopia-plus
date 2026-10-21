package io.github.lucassscassol.vardren;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.NonNull;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Loja e anúncios do app da Play Store.
 *
 * Compras (Google Play Billing 9): os produtos são "produtos de compra única" (não consumíveis) cadastrados no Play
 * Console com os mesmos IDs de js/store.js. A posse vem sempre da conta Google Play (queryPurchasesAsync a cada
 * abertura e ao voltar para o app), então as tribos continuam liberadas depois de reinstalar ou num aparelho novo,
 * e uma compra reembolsada deixa de valer. Toda compra é reconhecida (acknowledge), senão o Google a reembolsa em
 * 3 dias. Com a chave de licença do app (PLAY_LICENSE_KEY), a assinatura de cada compra é conferida no aparelho.
 *
 * Anúncios (AdMob + UMP): o formulário de consentimento aparece quando a lei exige (Europa, Reino Unido, alguns
 * estados dos EUA...) e só depois os anúncios são pedidos. Tela cheia entre partidas (o jogo decide quando) e vídeo
 * premiado opcional no Tesouro. Quem compra "remove_ads" não vê mais os de tela cheia.
 */
final class PlayServices implements PurchasesUpdatedListener {
    private static final String TAG = "Vardren";
    static final List<String> PRODUCTS = Collections.unmodifiableList(Arrays.asList(
        "tribe_kemet", "tribe_tarkhan", "tribe_eriu", "tribes_bundle", "remove_ads"));
    private static final String NO_ADS = "remove_ads";

    private final PlayActivity act;
    private final Handler main = new Handler(Looper.getMainLooper());
    private BillingClient billing;
    private ConsentInformation consent;

    // estado (lido e escrito na thread principal)
    private final Map<String, ProductDetails> details = new HashMap<>();
    private final Map<String, String> prices = new HashMap<>();
    private final Set<String> owned = new HashSet<>();
    private boolean billingOk, ownedKnown, gameReady, connecting;
    private String billingError = "";
    private String buying;

    // anúncios (lidos também pela thread da ponte)
    private final AtomicBoolean adsStarted = new AtomicBoolean(false);
    private volatile boolean adsRemoved;
    private volatile InterstitialAd interstitial;
    private volatile RewardedAd rewarded;
    private boolean loadingInterstitial, loadingRewarded;
    private int interstitialFails, rewardedFails;

    PlayServices(PlayActivity act) {
        this.act = act;
    }

    // ================================================================== Início
    void start() {
        billing = BillingClient.newBuilder(act)
            .setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection()
            .build();
        connect();

        // consentimento a cada abertura (o UMP só mostra o formulário quando precisa)
        consent = UserMessagingPlatform.getConsentInformation(act);
        ConsentRequestParameters params = new ConsentRequestParameters.Builder().setTagForUnderAgeOfConsent(false).build();
        consent.requestConsentInfoUpdate(act, params,
            () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(act, formError -> {
                if (formError != null) Log.w(TAG, "consentimento: " + formError.getMessage());
                afterConsent();
            }),
            requestError -> {
                Log.w(TAG, "consentimento: " + requestError.getMessage());
                afterConsent();
            });
        // consentimento já dado numa sessão anterior: os anúncios podem começar a carregar já
        if (consent.canRequestAds()) startAds();
    }

    // conexão com a Play Store (de novo ao voltar para o app, se da primeira vez falhou: sem conta, sem internet...)
    private void connect() {
        if (connecting) return;
        connecting = true;
        billing.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult r) {
                main.post(() -> {
                    connecting = false;
                    billingOk = r.getResponseCode() == BillingClient.BillingResponseCode.OK;
                    billingError = billingOk ? "" : r.getDebugMessage();
                    emitBilling();
                    if (billingOk) {
                        queryProducts();
                        refreshPurchases(false);
                    }
                });
            }

            @Override
            public void onBillingServiceDisconnected() {
                // enableAutoServiceReconnection: a biblioteca reconecta sozinha na próxima chamada
                main.post(() -> connecting = false);
            }
        });
    }

    /** O jogo carregou (PP.store.init): manda tudo o que já se sabe. */
    void onGameReady() {
        main.post(() -> {
            gameReady = true;
            emitBilling();
            if (!prices.isEmpty()) emitProducts();
            if (ownedKnown) emitOwned(false);
            emitConsent();
        });
    }

    void destroy() {
        if (billing != null) billing.endConnection();
        main.removeCallbacksAndMessages(null);
    }

    // ================================================================== Compras
    private void queryProducts() {
        List<QueryProductDetailsParams.Product> list = new ArrayList<>();
        for (String id : PRODUCTS) {
            list.add(QueryProductDetailsParams.Product.newBuilder().setProductId(id).setProductType(BillingClient.ProductType.INAPP).build());
        }
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder().setProductList(list).build();
        billing.queryProductDetailsAsync(params, (r, result) -> main.post(() -> {
            if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                Log.w(TAG, "produtos: " + r.getDebugMessage());
                return;
            }
            for (ProductDetails pd : result.getProductDetailsList()) {
                details.put(pd.getProductId(), pd);
                ProductDetails.OneTimePurchaseOfferDetails offer = pd.getOneTimePurchaseOfferDetails();
                if (offer != null) prices.put(pd.getProductId(), offer.getFormattedPrice());
            }
            if (!result.getUnfetchedProductList().isEmpty()) Log.w(TAG, "produtos não encontrados no Play Console: " + result.getUnfetchedProductList().size());
            emitProducts();
        }));
    }

    void buy(final String productId) {
        main.post(() -> {
            ProductDetails pd = details.get(productId);
            if (!billingOk || pd == null) {
                emitPurchase(productId, "error", billingOk ? "produto indisponível" : billingError);
                return;
            }
            BillingFlowParams.ProductDetailsParams.Builder item = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(pd);
            ProductDetails.OneTimePurchaseOfferDetails offer = pd.getOneTimePurchaseOfferDetails();
            if (offer != null && offer.getOfferToken() != null && !offer.getOfferToken().isEmpty()) item.setOfferToken(offer.getOfferToken());
            BillingFlowParams flow = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(Collections.singletonList(item.build()))
                .build();
            buying = productId;
            BillingResult r = billing.launchBillingFlow(act, flow);
            int code = r.getResponseCode();
            if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) refreshPurchases(true);
            else if (code != BillingClient.BillingResponseCode.OK) emitPurchase(productId, "error", r.getDebugMessage());
        });
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult r, List<Purchase> purchases) {
        main.post(() -> {
            int code = r.getResponseCode();
            String id = buying;
            buying = null;
            if (code == BillingClient.BillingResponseCode.OK && purchases != null) {
                for (Purchase p : purchases) handlePurchase(p, true);
            } else if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
                if (id != null) emitPurchase(id, "canceled", "");
            } else if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
                refreshPurchases(true);
            } else if (id != null) {
                emitPurchase(id, "error", r.getDebugMessage());
            }
        });
    }

    /** Libera o que foi pago e reconhece a compra. */
    private void handlePurchase(Purchase p, boolean announce) {
        if (!Security.verify(BuildConfig.PLAY_LICENSE_KEY, p.getOriginalJson(), p.getSignature())) {
            Log.w(TAG, "assinatura inválida, compra ignorada");
            return;
        }
        if (p.getPurchaseState() == Purchase.PurchaseState.PENDING) {
            if (announce) for (String id : p.getProducts()) emitPurchase(id, "pending", "");
            return;
        }
        if (p.getPurchaseState() != Purchase.PurchaseState.PURCHASED) return;
        for (String id : p.getProducts()) {
            if (!PRODUCTS.contains(id)) continue;
            owned.add(id);
            if (NO_ADS.equals(id)) setAdsRemoved(true);
            if (announce) emitPurchase(id, "ok", "");
        }
        if (!p.isAcknowledged()) {
            AcknowledgePurchaseParams ack = AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.getPurchaseToken()).build();
            billing.acknowledgePurchase(ack, ar -> {
                // se falhar, a próxima consulta (ao abrir ou voltar para o app) tenta de novo
                if (ar.getResponseCode() != BillingClient.BillingResponseCode.OK) Log.w(TAG, "acknowledge: " + ar.getDebugMessage());
            });
        }
    }

    /** Consulta as compras da conta. restored: o jogador tocou em Restaurar compras. */
    void refreshPurchases(final boolean restored) {
        main.post(() -> {
            if (billing == null) return;
            if (!billingOk) {
                if (restored) emitBilling();
                connect();
                return;
            }
            QueryPurchasesParams params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build();
            billing.queryPurchasesAsync(params, (r, list) -> main.post(() -> {
                if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    Log.w(TAG, "compras: " + r.getDebugMessage());
                    if (restored) emitPurchase("", "error", r.getDebugMessage());
                    return;
                }
                owned.clear();
                for (Purchase p : list) handlePurchase(p, false);
                ownedKnown = true;
                adsRemoved = owned.contains(NO_ADS);
                if (adsRemoved) interstitial = null;
                emitOwned(restored);
            }));
        });
    }

    // ================================================================== Consentimento e anúncios
    private void afterConsent() {
        main.post(() -> {
            emitConsent();
            if (consent.canRequestAds()) startAds();
        });
    }

    private void startAds() {
        if (!adsStarted.compareAndSet(false, true)) return;
        // o SDK pede para iniciar fora da thread principal
        new Thread(() -> MobileAds.initialize(act, status -> main.post(() -> {
            loadInterstitial();
            loadRewarded();
        })), "vardren-ads").start();
    }

    void showPrivacyOptions() {
        main.post(() -> UserMessagingPlatform.showPrivacyOptionsForm(act, err -> afterConsent()));
    }

    void setAdsRemoved(boolean removed) {
        if (removed) {
            adsRemoved = true;
            interstitial = null;
        } else if (adsRemoved && !owned.contains(NO_ADS)) {
            adsRemoved = false;
            main.post(this::loadInterstitial);
        }
    }

    private AdRequest request() {
        return new AdRequest.Builder().build();
    }

    private void loadInterstitial() {
        if (adsRemoved || interstitial != null || loadingInterstitial || !consent.canRequestAds()) return;
        loadingInterstitial = true;
        InterstitialAd.load(act, BuildConfig.AD_INTERSTITIAL, request(), new InterstitialAdLoadCallback() {
            @Override
            public void onAdLoaded(@NonNull InterstitialAd ad) {
                loadingInterstitial = false;
                interstitialFails = 0;
                interstitial = ad;
            }

            @Override
            public void onAdFailedToLoad(@NonNull LoadAdError e) {
                loadingInterstitial = false;
                retry(PlayServices.this::loadInterstitial, ++interstitialFails);
            }
        });
    }

    private void loadRewarded() {
        if (rewarded != null || loadingRewarded || !consent.canRequestAds()) return;
        loadingRewarded = true;
        RewardedAd.load(act, BuildConfig.AD_REWARDED, request(), new RewardedAdLoadCallback() {
            @Override
            public void onAdLoaded(@NonNull RewardedAd ad) {
                loadingRewarded = false;
                rewardedFails = 0;
                rewarded = ad;
            }

            @Override
            public void onAdFailedToLoad(@NonNull LoadAdError e) {
                loadingRewarded = false;
                retry(PlayServices.this::loadRewarded, ++rewardedFails);
            }
        });
    }

    // nova tentativa em 30 s, 60 s, 2 min... até 10 min
    private void retry(Runnable r, int fails) {
        long delay = Math.min(600_000L, 30_000L << Math.min(5, fails - 1));
        main.postDelayed(r, delay);
    }

    /** Chamado pela ponte: true se havia um anúncio pronto. */
    boolean showInterstitial() {
        final InterstitialAd ad = interstitial;
        if (adsRemoved || ad == null) return false;
        interstitial = null;
        main.post(() -> {
            ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                @Override
                public void onAdShowedFullScreenContent() {
                    act.mute(true);
                    emitAd("interstitial", "shown");
                }

                @Override
                public void onAdDismissedFullScreenContent() {
                    act.mute(false);
                    emitAd("interstitial", "closed");
                    loadInterstitial();
                }

                @Override
                public void onAdFailedToShowFullScreenContent(@NonNull AdError e) {
                    act.mute(false);
                    emitAd("interstitial", "failed");
                    loadInterstitial();
                }
            });
            ad.show(act);
        });
        return true;
    }

    /** Vídeo premiado: o jogo só dá a recompensa quando recebe "reward" (antes de "closed"). */
    boolean showRewarded() {
        final RewardedAd ad = rewarded;
        if (ad == null) return false;
        rewarded = null;
        main.post(() -> {
            ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                @Override
                public void onAdShowedFullScreenContent() {
                    act.mute(true);
                    emitAd("rewarded", "shown");
                }

                @Override
                public void onAdDismissedFullScreenContent() {
                    act.mute(false);
                    // pequena folga caso a recompensa chegue logo depois de fechar
                    main.postDelayed(() -> emitAd("rewarded", "closed"), 400);
                    loadRewarded();
                }

                @Override
                public void onAdFailedToShowFullScreenContent(@NonNull AdError e) {
                    act.mute(false);
                    emitAd("rewarded", "failed");
                    loadRewarded();
                }
            });
            ad.show(act, reward -> main.post(() -> emitAd("rewarded", "reward")));
        });
        return true;
    }

    // ================================================================== Eventos para o jogo
    private void send(JSONObject o) {
        if (gameReady) act.emit(o);
    }

    private void emitBilling() {
        try {
            send(new JSONObject().put("ev", "billing").put("ok", billingOk).put("msg", billingError));
        } catch (JSONException e) {
            Log.w(TAG, e);
        }
    }

    private void emitProducts() {
        try {
            JSONArray list = new JSONArray();
            for (Map.Entry<String, String> e : prices.entrySet()) {
                ProductDetails pd = details.get(e.getKey());
                list.put(new JSONObject().put("id", e.getKey()).put("price", e.getValue()).put("title", pd != null ? pd.getName() : ""));
            }
            send(new JSONObject().put("ev", "products").put("list", list));
        } catch (JSONException e) {
            Log.w(TAG, e);
        }
    }

    private void emitOwned(boolean restored) {
        try {
            send(new JSONObject().put("ev", "owned").put("list", new JSONArray(owned)).put("restored", restored));
        } catch (JSONException e) {
            Log.w(TAG, e);
        }
    }

    private void emitPurchase(String id, String state, String msg) {
        try {
            send(new JSONObject().put("ev", "purchase").put("id", id).put("state", state).put("msg", msg == null ? "" : msg));
        } catch (JSONException e) {
            Log.w(TAG, e);
        }
    }

    private void emitConsent() {
        if (consent == null) return;
        try {
            boolean privacy = consent.getPrivacyOptionsRequirementStatus() == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED;
            send(new JSONObject().put("ev", "consent").put("canAds", consent.canRequestAds()).put("privacyRequired", privacy));
        } catch (JSONException e) {
            Log.w(TAG, e);
        }
    }

    private void emitAd(String kind, String state) {
        try {
            send(new JSONObject().put("ev", "ad").put("kind", kind).put("state", state));
        } catch (JSONException e) {
            Log.w(TAG, e);
        }
    }
}
