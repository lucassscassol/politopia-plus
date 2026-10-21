package io.github.lucassscassol.vardren;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.window.OnBackInvokedDispatcher;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Chamas de Vardren na Google Play: o mesmo jogo da MainActivity, mais a loja (Google Play Billing) e os anúncios
 * (AdMob, com o formulário de consentimento do UMP). O jogo conversa com o app pela ponte window.VardrenNative
 * (js/store.js); as respostas voltam por PP.store.fromNative(json).
 */
public class PlayActivity extends MainActivity {
    private PlayServices play;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        // Android 13+: voltar pelo OnBackInvokedCallback (com targetSdk 36 o onBackPressed não é mais chamado)
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
    }

    @Override
    protected void onWebReady(WebView view) {
        play = new PlayServices(this);
        view.addJavascriptInterface(new NativeBridge(), "VardrenNative");
        play.start();
    }

    @Override
    protected void onResume() {
        super.onResume();
        // compras feitas fora do app (ou pagamentos pendentes concluídos) aparecem aqui
        if (play != null) play.refreshPurchases(false);
    }

    @Override
    protected void onDestroy() {
        if (play != null) play.destroy();
        super.onDestroy();
    }

    @Override
    protected void hideSystemUi() {
        if (Build.VERSION.SDK_INT >= 30 && web != null) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                return;
            }
        }
        super.hideSystemUi();
    }

    /** Entrega um evento ao jogo: PP.store.fromNative({ ev, ... }). */
    void emit(JSONObject event) {
        runJs("(function(){try{if(window.PP&&PP.store)PP.store.fromNative(" + JSONObject.quote(event.toString()) + ");}catch(e){}})()");
    }

    void mute(boolean on) {
        runJs(on ? JS_MUTE : JS_UNMUTE);
    }

    /** Métodos chamados pelo jogo (rodam na thread da ponte, não na principal). */
    private final class NativeBridge {
        @JavascriptInterface
        public String info() {
            JSONObject o = new JSONObject();
            try {
                o.put("billing", true);
                o.put("ads", true);
                o.put("store", "play");
                o.put("version", BuildConfig.VERSION_NAME);
            } catch (JSONException e) {
                // não acontece
            }
            return o.toString();
        }

        @JavascriptInterface
        public void init() {
            play.onGameReady();
        }

        @JavascriptInterface
        public void buy(String productId) {
            play.buy(productId);
        }

        @JavascriptInterface
        public void restore() {
            play.refreshPurchases(true);
        }

        @JavascriptInterface
        public boolean showInterstitial() {
            return play.showInterstitial();
        }

        @JavascriptInterface
        public boolean showRewarded() {
            return play.showRewarded();
        }

        @JavascriptInterface
        public void privacyOptions() {
            play.showPrivacyOptions();
        }

        @JavascriptInterface
        public void setAdsRemoved(boolean removed) {
            play.setAdsRemoved(removed);
        }
    }
}
