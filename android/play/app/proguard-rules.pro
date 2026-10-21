# A ponte do jogo (window.VardrenNative) é chamada pelo JavaScript: os métodos não podem ser renomeados nem removidos
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
