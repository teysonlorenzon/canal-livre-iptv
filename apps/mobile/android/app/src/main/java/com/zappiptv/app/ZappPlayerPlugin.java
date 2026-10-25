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
    private static ZappPlayerPlugin instance;

    @Override
    public void load() { instance = this; }

    /** Se o aparelho tem picture-in-picture. */
    static boolean pipSupported(Activity a) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && a.getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
    }

    /** Coloca o app em PiP, com a janela no formato 16:9. */
    static boolean enter(Activity a) {
        if (!pipSupported(a)) return false;
        try {
            PictureInPictureParams params = new PictureInPictureParams.Builder().setAspectRatio(new Rational(16, 9)).build();
            return a.enterPictureInPictureMode(params);
        } catch (IllegalStateException e) {
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

    @PluginMethod
    public void isPipSupported(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("supported", pipSupported(getActivity()));
        call.resolve(ret);
    }

    @PluginMethod
    public void enterPip(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject ret = new JSObject();
            ret.put("entered", enter(getActivity()));
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void setAutoPip(PluginCall call) {
        autoPip = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        call.resolve();
    }

    @PluginMethod
    public void setFullscreen(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        Activity a = getActivity();
        a.runOnUiThread(() -> {
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(a.getWindow(), a.getWindow().getDecorView());
            if (on) {
                c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                c.hide(WindowInsetsCompat.Type.systemBars());
                a.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            } else {
                c.show(WindowInsetsCompat.Type.systemBars());
                // Volta a seguir a rotação do sistema: gira com o aparelho quando a rotação automática
                // está ligada e respeita a trava de orientação do usuário quando está desligada.
                a.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_USER);
            }
            call.resolve();
        });
    }
}
