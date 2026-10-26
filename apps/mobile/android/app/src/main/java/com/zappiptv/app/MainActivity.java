package com.zappiptv.app;

import android.content.res.Configuration;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/**
 * Atividade principal do app Android: registra o plugin ZappPlayer e repassa ao plugin os
 * eventos de picture-in-picture.
 */
public class MainActivity extends BridgeActivity {

    /**
     * Registra o plugin nativo do player antes de iniciar o Capacitor e liga o proxy de vídeo
     * (vídeos de outros servidores pela origem do app, para a detecção da abertura pelo som).
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ZappPlayerPlugin.class);
        super.onCreate(savedInstanceState);
        bridge.setWebViewClient(new MediaProxyWebViewClient(bridge));
    }

    /** Ao sair do app com vídeo tocando, continua em picture-in-picture. */
    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (ZappPlayerPlugin.autoPip) ZappPlayerPlugin.enter(this);
    }

    /** Avisa o app web quando entra ou sai do picture-in-picture. */
    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        ZappPlayerPlugin.notifyPip(isInPictureInPictureMode);
    }
}
