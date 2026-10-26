package com.zappiptv.app;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;

/**
 * Serve vídeos de outros servidores pela origem do app (`http://localhost/_zapp_media_?u=<url>`).
 * Assim o vídeo fica na mesma origem da página e o app web consegue ler o áudio
 * (`video.captureStream()`) para detectar a abertura dos episódios, mesmo quando o servidor
 * IPTV não manda cabeçalhos CORS. O pedido de faixa (`Range`) é repassado, então o avanço e o
 * retrocesso continuam funcionando; o resto dos pedidos segue para o Capacitor.
 */
public class MediaProxyWebViewClient extends BridgeWebViewClient {

    /** Caminho tratado pelo proxy. */
    static final String MEDIA_PROXY_PATH = "/_zapp_media_";
    /** Redirecionamentos seguidos no máximo (inclusive de http para https). */
    private static final int MAX_REDIRECTS = 5;
    /** Cabeçalhos do servidor repassados ao vídeo. */
    private static final String[] FORWARDED_RESPONSE_HEADERS = { "Content-Length", "Content-Range", "Accept-Ranges", "Last-Modified", "ETag" };

    /** Cria o cliente da WebView com o proxy de vídeo. */
    public MediaProxyWebViewClient(Bridge bridge) {
        super(bridge);
    }

    /** Atende os pedidos do proxy de vídeo; os demais seguem o Capacitor. */
    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri requestUri = request.getUrl();
        if (!MEDIA_PROXY_PATH.equals(requestUri.getPath()) || !"localhost".equalsIgnoreCase(requestUri.getHost())) return super.shouldInterceptRequest(view, request);
        String targetUrl = requestUri.getQueryParameter("u");
        boolean isMediaMethod = "GET".equals(request.getMethod()) || "HEAD".equals(request.getMethod());
        if (request.isForMainFrame() || !isMediaMethod || targetUrl == null || !targetUrl.matches("(?i)^https?://.+")) return errorResponse(400, "Bad Request");
        try {
            return proxyMedia(request, targetUrl);
        } catch (IOException exception) {
            return errorResponse(502, "Bad Gateway");
        }
    }

    /** Busca o vídeo no servidor de origem repassando a faixa pedida e devolve o conteúdo aos poucos. */
    private WebResourceResponse proxyMedia(WebResourceRequest request, String targetUrl) throws IOException {
        Map<String, String> requestHeaders = request.getRequestHeaders();
        HttpURLConnection connection = null;
        URL currentUrl = new URL(targetUrl);
        for (int redirectCount = 0; ; redirectCount++) {
            connection = (HttpURLConnection) currentUrl.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(20000);
            connection.setReadTimeout(30000);
            connection.setRequestMethod(request.getMethod());
            copyRequestHeader(requestHeaders, connection, "Range");
            copyRequestHeader(requestHeaders, connection, "User-Agent");
            copyRequestHeader(requestHeaders, connection, "Accept");
            connection.setRequestProperty("Accept-Encoding", "identity");
            int statusCode = connection.getResponseCode();
            String location = connection.getHeaderField("Location");
            if (statusCode < 300 || statusCode >= 400 || location == null || redirectCount >= MAX_REDIRECTS) break;
            connection.disconnect();
            currentUrl = new URL(currentUrl, location);
        }
        int statusCode = connection.getResponseCode();
        Map<String, String> responseHeaders = new HashMap<>();
        for (String headerName : FORWARDED_RESPONSE_HEADERS) {
            String headerValue = connection.getHeaderField(headerName);
            if (headerValue != null) responseHeaders.put(headerName, headerValue);
        }
        responseHeaders.put("Cache-Control", "no-store");
        responseHeaders.put("Content-Security-Policy", "sandbox; frame-ancestors 'none'");
        String contentType = connection.getContentType();
        String mimeType = contentType == null ? "application/octet-stream" : contentType.split(";")[0].trim();
        InputStream upstreamStream = statusCode >= 400 ? connection.getErrorStream() : connection.getInputStream();
        if (upstreamStream == null) upstreamStream = new ByteArrayInputStream(new byte[0]);
        HttpURLConnection openConnection = connection;
        InputStream bodyStream = new FilterInputStream(upstreamStream) {
            @Override
            public void close() throws IOException {
                try { super.close(); } finally { openConnection.disconnect(); }
            }
        };
        String reasonPhrase = connection.getResponseMessage();
        if (reasonPhrase == null || reasonPhrase.isEmpty()) reasonPhrase = statusCode == 206 ? "Partial Content" : "OK";
        return new WebResourceResponse(mimeType, null, statusCode, reasonPhrase, responseHeaders, bodyStream);
    }

    /** Repassa um cabeçalho do pedido do vídeo ao servidor de origem, se existir. */
    private static void copyRequestHeader(Map<String, String> requestHeaders, HttpURLConnection connection, String headerName) {
        if (requestHeaders == null) return;
        for (Map.Entry<String, String> header : requestHeaders.entrySet()) {
            if (headerName.equalsIgnoreCase(header.getKey())) { connection.setRequestProperty(headerName, header.getValue()); return; }
        }
    }

    /** Resposta vazia de erro (o player passa para a próxima forma de tocar). */
    private static WebResourceResponse errorResponse(int statusCode, String reasonPhrase) {
        return new WebResourceResponse("text/plain", "utf-8", statusCode, reasonPhrase, new HashMap<>(), new ByteArrayInputStream(new byte[0]));
    }
}
