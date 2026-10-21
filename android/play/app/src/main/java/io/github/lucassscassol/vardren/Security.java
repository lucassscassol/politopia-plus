package io.github.lucassscassol.vardren;

import android.text.TextUtils;
import android.util.Base64;
import android.util.Log;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;

/**
 * Confere a assinatura de uma compra com a chave pública de licença do app (Play Console → Monetizar com o Play →
 * Configuração da monetização → Licenciamento). Sem servidor próprio, esta é a verificação possível: barra compras
 * forjadas por apps de "compra grátis", mas não um APK modificado. Sem chave configurada, não confere.
 */
final class Security {
    private Security() {
    }

    static boolean verify(String base64Key, String signedData, String signature) {
        if (TextUtils.isEmpty(base64Key)) return true;
        if (TextUtils.isEmpty(signedData) || TextUtils.isEmpty(signature)) return false;
        try {
            byte[] keyBytes = Base64.decode(base64Key, Base64.DEFAULT);
            PublicKey key = KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(keyBytes));
            Signature sig = Signature.getInstance("SHA1withRSA");
            sig.initVerify(key);
            sig.update(signedData.getBytes(StandardCharsets.UTF_8));
            return sig.verify(Base64.decode(signature, Base64.DEFAULT));
        } catch (Exception e) {
            Log.w("Vardren", "verificação da compra: " + e);
            return false;
        }
    }
}
