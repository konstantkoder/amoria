import React, { useEffect, useRef, useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { WebView } from "react-native-webview";

type Marker = { lat: number; lng: number; label?: string };

type Props = {
  center: { lat: number; lng: number };
  zoom?: number;
  markers?: Marker[];
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
};

const HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
  <style>
    html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; background: transparent; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  <script>
    let map = null;
    let markersLayer = null;
    // AMORIA_FIX_MAP_PENDING_PAYLOAD
    let pendingPayload = null;
    // AMORIA_FIX_MAP_INJECT_V2
    let lastSeq = 0;

    function waitForLeaflet() {
      if (window.L && typeof window.L.map === "function") {
        init();
        if (pendingPayload) {
          try { window.__applyPayload(pendingPayload); } catch(e) {}
          pendingPayload = null;
        }
        return;
      }
      setTimeout(waitForLeaflet, 50);
    }

    function init() {
      map = L.map('map', { zoomControl: true, attributionControl: false });
      map.setView([0,0], 2);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(map);

      markersLayer = L.layerGroup().addTo(map);
      setTimeout(() => { try { map.invalidateSize(); } catch(e) {} }, 300);
    }

    function apply(DATA) {
      if (!map || !DATA || !DATA.center) return;

      const center = DATA.center;
      const zoom = DATA.zoom || 14;
      try { map.setView([center.lat, center.lng], zoom, { animate: false }); } catch(e) {}

      try {
        markersLayer.clearLayers();
        (DATA.markers || []).forEach(m => {
          const mk = L.marker([m.lat, m.lng]).addTo(markersLayer);
          if (m.label) mk.bindPopup(m.label);
        });
      } catch(e) {}
    }

    // AMORIA_FIX_MAP_INJECT_V2
    window.__applyPayload = function(DATA) {
      try {
        // AMORIA_FIX_MAP_PENDING_PAYLOAD
        if (!map) { pendingPayload = DATA; return; }
        const seq = Number(DATA && DATA.seq ? DATA.seq : 0);
        if (seq && seq < lastSeq) return;
        if (seq) lastSeq = seq;
        apply(DATA);
        setTimeout(() => { try { map && map.invalidateSize(); } catch(e) {} }, 50);
      } catch(e) {}
    };

    function onMsg(event) {
      try {
        const data = JSON.parse(event.data);
        if (window.__applyPayload) window.__applyPayload(data);
      } catch(e) {}
    }

    document.addEventListener('message', onMsg);
    window.addEventListener('message', onMsg);

    waitForLeaflet();
  </script>
</body>
</html>`;

export function OpenStreetMapWebView({
  center,
  zoom = 14,
  markers = [],
  style,
  interactive = true,
}: Props) {
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);

  // AMORIA_FIX_MAP_INJECT_V2
  const seqRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const payload = { center, zoom, markers };
    debounceRef.current = setTimeout(() => {
      seqRef.current += 1;
      const body = JSON.stringify({ seq: seqRef.current, ...payload }).replace(
        /</g,
        "\\u003c"
      );
      ref.current?.injectJavaScript(
        `window.__applyPayload(${body}); true;`
      );
    }, 100);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [ready, center.lat, center.lng, zoom, markers]);

  return (
    <WebView
      ref={ref}
      style={style}
      pointerEvents={interactive ? "auto" : "none"}
      scrollEnabled={interactive}
      originWhitelist={["*"]}
      javaScriptEnabled
      domStorageEnabled
      mixedContentMode="always"
      setSupportMultipleWindows={false}
      cacheEnabled={false}
      onLoadEnd={() => {
        setReady(true);
      }}
      source={{ html: HTML }}
    />
  );
}
