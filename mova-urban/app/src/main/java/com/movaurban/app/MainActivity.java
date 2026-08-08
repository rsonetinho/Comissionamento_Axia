package com.movaurban.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity implements LocationListener {
    private WebView webView;
    private LocationManager locationManager;
    private static final int REQ_LOCATION = 1001;
    private boolean pageReady = false;
    private Location lastLocation;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                pageReady = true;
                if (lastLocation != null) pushLocationToWeb(lastLocation);
                startNativeLocation();
            }
        });

        if (android.os.Build.VERSION.SDK_INT >= 23 &&
            checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            }, REQ_LOCATION);
        } else {
            startNativeLocation();
        }

        webView.loadUrl("file:///android_asset/index.html");
    }

    private void startNativeLocation() {
        if (locationManager == null) return;
        if (android.os.Build.VERSION.SDK_INT >= 23 &&
            checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            showLocationStatus("Permita o acesso à localização");
            return;
        }

        boolean gps = false;
        boolean network = false;
        try { gps = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER); } catch (Exception ignored) {}
        try { network = locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER); } catch (Exception ignored) {}

        if (!gps && !network) {
            showLocationStatus("Ative a localização do celular");
            return;
        }

        try {
            Location best = null;
            if (gps) best = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            if (network) {
                Location n = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
                if (best == null || (n != null && n.getTime() > best.getTime())) best = n;
            }
            if (best != null) {
                lastLocation = best;
                pushLocationToWeb(best);
            }
        } catch (SecurityException ignored) {}

        try {
            if (gps) locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1500L, 2f, this);
            if (network) locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 2500L, 5f, this);
            showLocationStatus("Buscando GPS…");
        } catch (SecurityException e) {
            showLocationStatus("Não foi possível acessar o GPS");
        }
    }

    @Override
    public void onLocationChanged(Location location) {
        if (location == null) return;
        if (lastLocation == null || location.getAccuracy() <= lastLocation.getAccuracy() + 30 ||
            location.getTime() > lastLocation.getTime() + 10000) {
            lastLocation = location;
            pushLocationToWeb(location);
        }
    }

    private void pushLocationToWeb(Location location) {
        if (!pageReady || webView == null || location == null) return;
        final double lat = location.getLatitude();
        final double lon = location.getLongitude();
        final float accuracy = location.hasAccuracy() ? location.getAccuracy() : 0f;
        runOnUiThread(() -> {
            String js = "(function(){" +
                "if(typeof map==='undefined'||typeof L==='undefined')return;" +
                "userPos=[" + lat + "," + lon + "];" +
                "var s=document.getElementById('mapStatus');if(s)s.textContent='Localização atual • precisão ~" + Math.round(accuracy) + " m';" +
                "var o=document.getElementById('origem');if(o)o.value='Minha localização atual';" +
                "if(!userMarker){" +
                  "userMarker=L.circleMarker(userPos,{radius:9,color:'#fff',weight:3,fillColor:'#0f9d8a',fillOpacity:1}).addTo(map).bindPopup('Você está aqui');" +
                  "map.setView(userPos,16);" +
                  "if(typeof spawnDrivers==='function'&&driverMarkers.length===0)spawnDrivers();" +
                "}else{userMarker.setLatLng(userPos);}" +
                "if(typeof updateDriverDistances==='function')updateDriverDistances();" +
                "if(destPos&&typeof routeToDestination==='function')routeToDestination();" +
            "})();";
            webView.evaluateJavascript(js, null);
        });
    }

    private void showLocationStatus(String text) {
        if (!pageReady || webView == null) return;
        String safe = text.replace("'", "\\'");
        runOnUiThread(() -> webView.evaluateJavascript(
            "(function(){var s=document.getElementById('mapStatus');if(s)s.textContent='" + safe + "';})();", null));
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_LOCATION) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startNativeLocation();
            } else {
                showLocationStatus("Permissão de localização negada");
            }
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (pageReady) startNativeLocation();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (locationManager != null) {
            try { locationManager.removeUpdates(this); } catch (Exception ignored) {}
        }
    }

    @Override
    protected void onDestroy() {
        if (locationManager != null) {
            try { locationManager.removeUpdates(this); } catch (Exception ignored) {}
        }
        if (webView != null) webView.destroy();
        super.onDestroy();
    }

    @Override
    public void onProviderEnabled(String provider) {
        startNativeLocation();
    }

    @Override
    public void onProviderDisabled(String provider) {
        showLocationStatus("Localização desativada");
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
