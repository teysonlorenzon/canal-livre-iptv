package com.zappiptv.app;

import android.app.Activity;
import android.app.PictureInPictureParams;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.os.Build;
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
 * flutuante) e tela cheia de verdade (esconde as barras do sistema e gira para paisagem).
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
