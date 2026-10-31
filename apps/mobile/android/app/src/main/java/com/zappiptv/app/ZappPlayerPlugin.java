package com.zappiptv.app;

import android.app.Activity;
import android.app.PictureInPictureParams;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import android.util.Rational;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Recursos do player que a WebView do Android não oferece: picture-in-picture (janela
 * flutuante), tela cheia de verdade (esconde as barras do sistema e gira para paisagem) e a
 * replicação da tela para a TV (Smart View, Chromecast e similares).
 */
@CapacitorPlugin(name = "ZappPlayer")
public class ZappPlayerPlugin extends Plugin {

    /** Entra em PiP sozinho ao sair do app (botão Início/gesto) enquanto há vídeo tocando. */
    static boolean autoPip = false;
    /** Instância carregada do plugin, usada para avisar o app web sobre o PiP. */
    private static ZappPlayerPlugin instance;

    /** Guarda a instância do plugin ao carregar. */
    @Override
    public void load() { instance = this; }

    /** Se o aparelho tem picture-in-picture. */
    static boolean pipSupported(Activity activity) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && activity.getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
    }

    /** Coloca o app em PiP, com a janela no formato 16:9. */
    static boolean enter(Activity activity) {
        if (!pipSupported(activity)) return false;
        try {
            PictureInPictureParams params = new PictureInPictureParams.Builder().setAspectRatio(new Rational(16, 9)).build();
            return activity.enterPictureInPictureMode(params);
        } catch (IllegalStateException exception) {
            return false;
        }
    }

    /** Avisa o app web que entrou ou saiu do PiP (para esconder os controles). */
    static void notifyPip(boolean active) {
        if (instance == null) return;
        JSObject data = new JSObject();
        data.put("active", active);
        instance.notifyListeners("pipChanged", data);
    }

    /** Responde se o aparelho tem picture-in-picture (`supported`). */
    @PluginMethod
    public void isPipSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", pipSupported(getActivity()));
        call.resolve(result);
    }

    /** Entra em picture-in-picture e responde se conseguiu (`entered`). */
    @PluginMethod
    public void enterPip(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject result = new JSObject();
            result.put("entered", enter(getActivity()));
            call.resolve(result);
        });
    }

    /**
     * Abre a tela do sistema que replica a tela do celular numa TV e responde se ela abriu
     * (`opened`). Cada fabricante usa a sua (Smart View na Samsung, Transmitir, Wi-Fi Display),
     * então tenta uma por vez até alguma abrir.
     */
    @PluginMethod
    public void openCastSettings(PluginCall call) {
        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            JSObject result = new JSObject();
            result.put("opened", startFirstAvailable(activity, castIntents()));
            call.resolve(result);
        });
    }

    /** Telas de replicar a tela, da mais específica para a mais genérica. */
    private static Intent[] castIntents() {
        return new Intent[] {
            new Intent().setClassName("com.samsung.android.smartmirroring", "com.samsung.android.smartmirroring.CastingDialog"),
            new Intent(Settings.ACTION_CAST_SETTINGS),
            new Intent("android.settings.WIFI_DISPLAY_SETTINGS"),
        };
    }

    /**
     * Inicia a primeira intent que o aparelho consegue abrir.
     * @return Se alguma abriu.
     */
    private static boolean startFirstAvailable(Activity activity, Intent[] intents) {
        for (Intent intent : intents) {
            try {
                activity.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                return true;
            } catch (ActivityNotFoundException | SecurityException exception) {
                continue;
            }
        }
        return false;
    }

    /** Liga ou desliga (`enabled`) a entrada automática em PiP ao sair do app. */
    @PluginMethod
    public void setAutoPip(PluginCall call) {
        autoPip = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        call.resolve();
    }

    /**
     * Liga ou desliga (`enabled`) a tela cheia: esconde as barras do sistema e gira para
     * paisagem. Ao desligar, volta a seguir a rotação do sistema: gira com o aparelho quando a
     * rotação automática está ligada e respeita a trava de orientação do usuário quando está
     * desligada.
     */
    @PluginMethod
    public void setFullscreen(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            WindowInsetsControllerCompat insetsController = WindowCompat.getInsetsController(activity.getWindow(), activity.getWindow().getDecorView());
            if (enabled) {
                insetsController.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                insetsController.hide(WindowInsetsCompat.Type.systemBars());
                activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            } else {
                insetsController.show(WindowInsetsCompat.Type.systemBars());
                activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_USER);
            }
            call.resolve();
        });
    }
}
