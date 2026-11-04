package io.github.anandhavaradhan.hollowmere;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.Manifest;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/**
 * Hollowmere V3 as a standalone app. The game's own files are inside the APK (assets/www, copied from
 * hollowmere-v3/ at build time) and run in this activity's WebView, served from
 * https://appassets.androidplatform.net so they behave like a normal https page (modules, storage).
 * three.js and the Firebase SDK, which the game asks CDNs for, are answered from assets/vendor too,
 * so solo play needs no internet. Accounts, co-op and the boards use Firebase over the internet as on the web.
 */
public class MainActivity extends Activity {
    private static final String HOST = WebViewAssetLoader.DEFAULT_DOMAIN; // appassets.androidplatform.net
    private static final String START = "https://" + HOST + "/www/index.html";

    /* CDN files the game imports, and where the APK keeps a copy */
    private static final String FIREBASE_PREFIX = "https://www.gstatic.com/firebasejs/12.19.0/";
    private static final Map<String, String> CDN = new HashMap<>();
    static {
        CDN.put("https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js", "vendor/three.module.js");
    }

    /* links that only make sense on the website (other game versions) are hidden in the app */
    private static final String APP_CSS = "#titleVersion,#titleVersionB{display:none!important}";
    private static final String APP_JS = "(function(){var c=" + JSONObject.quote(APP_CSS) + ";"
            + "function a(){if(document.getElementById('hm-app-css'))return;var s=document.createElement('style');"
            + "s.id='hm-app-css';s.textContent=c;(document.head||document.documentElement).appendChild(s);}"
            + "if(document.documentElement)a();document.addEventListener('DOMContentLoaded',a);})();";

    private static final int REQ_MIC = 71;
    private PermissionRequest pendingMic;   // the page's microphone request, waiting for the phone's permission box
    private WebView web;
    private WebViewAssetLoader assets;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        assets = new WebViewAssetLoader.Builder()
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        buildWebView();
        setContentView(web);
        immersive();
        if (state != null) web.restoreState(state);
        if (web.getUrl() == null) web.loadUrl(START);
    }

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    private void buildWebView() {
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportMultipleWindows(false);
        s.setSupportZoom(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setTextZoom(100);                                  // the game's layout ignores the phone's font size
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setLongClickable(false);                         // holding BURST / VEIL must not open a menu
        web.setOnLongClickListener(v -> true);
        web.setHapticFeedbackEnabled(false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            web.setOnApplyWindowInsetsListener((v, insets) -> {
                v.setPadding(0, 0, 0, insets.getInsets(WindowInsets.Type.ime()).bottom);
                return insets;
            });
        }

        web.addJavascriptInterface(new Bridge(), "HollowmereAndroid");
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(web, APP_JS, Collections.singleton("https://" + HOST));
        }

        /* A WebView answers confirm() with "no" and ignores alert() unless the app shows the dialog itself.
           The game asks "End this night?" and "Leave your team?" this way, so show them as real dialogs. */
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                if (isFinishing()) { result.cancel(); return true; }
                new AlertDialog.Builder(MainActivity.this, android.R.style.Theme_Material_Dialog_Alert)
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm())
                        .setNegativeButton(android.R.string.cancel, (d, w) -> result.cancel())
                        .setOnCancelListener(d -> result.cancel())
                        .show();
                return true;
            }

            @Override
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                if (isFinishing()) { result.confirm(); return true; }
                new AlertDialog.Builder(MainActivity.this, android.R.style.Theme_Material_Dialog_Alert)
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm())
                        .setOnCancelListener(d -> result.confirm())
                        .show();
                return true;
            }

            /* co-op voice chat asks for the microphone (getUserMedia): ask the phone for it at that moment */
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                boolean wantsMic = false;
                for (String r : request.getResources()) if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) wantsMic = true;
                if (!wantsMic || !HOST.equals(request.getOrigin().getHost())) { request.deny(); return; }
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                } else {
                    if (pendingMic != null) pendingMic.deny();
                    pendingMic = request;
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
                }
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (request == pendingMic) pendingMic = null;
            }

            @Override
            public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, JsPromptResult result) {
                result.cancel();
                return true;
            }
        });

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                String url = req.getUrl().toString();
                if (HOST.equals(req.getUrl().getHost())) return assets.shouldInterceptRequest(req.getUrl());
                String local = CDN.get(url);
                if (local == null && url.startsWith(FIREBASE_PREFIX)) {
                    String name = req.getUrl().getLastPathSegment();
                    if (name != null && name.matches("[A-Za-z0-9_.-]+\\.js")) local = "vendor/firebasejs/" + name;
                }
                return local == null ? null : asset(local);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) {
                    String p = u.getPath();
                    return p == null || !p.startsWith("/www/");  // stay inside the game's own pages
                }
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException e) { /* nothing can open it */ }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript(APP_JS, null);  // in case document-start scripts are not supported
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // the page's renderer crashed or was killed for memory: start the game again rather than closing
                ((android.view.ViewGroup) view.getParent()).removeView(view);
                view.destroy();
                buildWebView();
                setContentView(web);
                web.loadUrl(START);
                return true;
            }
        });
    }

    private WebResourceResponse asset(String path) {
        try {
            InputStream in = getAssets().open(path);
            Map<String, String> h = new HashMap<>();
            h.put("Access-Control-Allow-Origin", "*");
            h.put("Cache-Control", "no-cache");
            return new WebResourceResponse("text/javascript", "utf-8", 200, "OK", h, in);
        } catch (IOException e) {
            return null;  // not packed: let the WebView fetch it from the internet
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code != REQ_MIC || pendingMic == null) return;
        PermissionRequest r = pendingMic;
        pendingMic = null;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            r.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        } else {
            r.deny();   // the game then plays on without voice chat
        }
    }

    /** what the page can ask of the app (see androidGoogleToken in hollowmere-v3/cloud.js) */
    private class Bridge {
        @JavascriptInterface
        public void googleSignIn() {
            runOnUiThread(MainActivity.this::startGoogleSignIn);
        }
    }

    private void startGoogleSignIn() {
        GetSignInWithGoogleOption option =
                new GetSignInWithGoogleOption.Builder(getString(R.string.googleWebClientId)).build();
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
        CredentialManager.create(this).getCredentialAsync(this, request, new CancellationSignal(), this::runOnUiThread,
                new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override
                    public void onResult(GetCredentialResponse response) {
                        Credential c = response.getCredential();
                        if (c instanceof CustomCredential
                                && GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(c.getType())) {
                            try {
                                googleDone(GoogleIdTokenCredential.createFrom(c.getData()).getIdToken(), null);
                            } catch (Exception e) {
                                googleDone(null, "bad token");
                            }
                        } else {
                            googleDone(null, "unexpected credential");
                        }
                    }

                    @Override
                    public void onError(GetCredentialException e) {
                        googleDone(null, e instanceof GetCredentialCancellationException ? "cancelled"
                                : e.getClass().getSimpleName() + (e.getMessage() != null ? " " + e.getMessage() : ""));
                    }
                });
    }

    private void googleDone(String token, String error) {
        String js = "window.__hmGoogleDone&&window.__hmGoogleDone("
                + (token == null ? "null" : JSONObject.quote(token)) + ","
                + (error == null ? "null" : JSONObject.quote(error)) + ")";
        web.evaluateJavascript(js, null);
    }

    /* full screen: hide the status and navigation bars; a swipe from the edge shows them for a moment */
    @SuppressWarnings("deprecation")
    private void immersive() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }

    /* Back: a page back if there is one (lobby -> game). On the game page it opens the game's own settings
       (Escape) during a night instead of closing the app by accident, and only leaves the app from the title. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        if (web.canGoBack()) { web.goBack(); return; }
        web.evaluateJavascript("(function(){var t=document.getElementById('titleOv');"
                + "if(!t||!t.classList.contains('hidden'))return 'exit';"
                + "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',keyCode:27,bubbles:true}));"
                + "return 'esc';})()", value -> { if (value != null && value.contains("exit")) finish(); });
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) { web.onPause(); web.pauseTimers(); }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) { web.onResume(); web.resumeTimers(); }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
