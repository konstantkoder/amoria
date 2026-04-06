import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { WebView } from "react-native-webview";

import { theme } from "@/theme/theme";
import type { SharedCanvasStroke } from "@/components/play/SharedCanvasWebView";

type Props = {
  strokes: SharedCanvasStroke[];
  autoplay?: boolean;
  speed?: number;
  showControls?: boolean;
  onReplayEnd?: () => void;
};

const HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
  />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #101423;
    }

    #root {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background:
        radial-gradient(circle at top left, rgba(255, 122, 60, 0.12), transparent 30%),
        radial-gradient(circle at bottom right, rgba(249, 115, 147, 0.12), transparent 34%),
        linear-gradient(180deg, #171a2b 0%, #101423 100%);
    }

    canvas {
      width: 100%;
      height: 100%;
      display: block;
    }
  </style>
</head>
<body>
  <div id="root">
    <canvas id="canvas"></canvas>
  </div>
  <script>
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");

    const state = {
      strokes: [],
      visibleCount: 0,
    };

    function clonePoint(point) {
      return { x: Number(point.x || 0), y: Number(point.y || 0) };
    }

    function normalizeStroke(stroke) {
      return {
        id: String(stroke && stroke.id ? stroke.id : ""),
        uid: String(stroke && stroke.uid ? stroke.uid : ""),
        color: String(stroke && stroke.color ? stroke.color : "#F97393"),
        width: Number(stroke && stroke.width ? stroke.width : 6),
        points: Array.isArray(stroke && stroke.points)
          ? stroke.points.map(clonePoint)
          : [],
      };
    }

    function post(message) {
      try {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(message));
      } catch (e) {}
    }

    function resizeCanvas(nextWidth, nextHeight) {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const width = Math.max(Math.round(Number(nextWidth || window.innerWidth || 1)), 1);
      const height = Math.max(Math.round(Number(nextHeight || window.innerHeight || 1)), 1);

      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      redraw();
    }

    function drawStroke(stroke) {
      if (!stroke || !stroke.points || !stroke.points.length) return;

      const points = stroke.points;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (points.length === 1) {
        const point = points[0];
        ctx.fillStyle = stroke.color;
        ctx.beginPath();
        ctx.arc(point.x, point.y, Math.max(stroke.width / 2, 1), 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
    }

    function redraw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < state.visibleCount; i += 1) {
        drawStroke(state.strokes[i]);
      }
    }

    function applyPayload(data) {
      if (!data) return;

      if (data.type === "init" || data.type === "sync") {
        state.strokes = Array.isArray(data.strokes) ? data.strokes.map(normalizeStroke) : [];
        state.visibleCount = Math.max(0, Math.min(Number(data.visibleCount || 0), state.strokes.length));
        if (data.size) resizeCanvas(data.size.width, data.size.height);
        redraw();
        return;
      }

      if (data.type === "progress") {
        state.visibleCount = Math.max(0, Math.min(Number(data.visibleCount || 0), state.strokes.length));
        redraw();
        return;
      }

      if (data.type === "resize" && data.size) {
        resizeCanvas(data.size.width, data.size.height);
      }
    }

    function onMessage(event) {
      try {
        applyPayload(JSON.parse(event.data));
      } catch (e) {}
    }

    window.__applyPayload = applyPayload;
    document.addEventListener("message", onMessage);
    window.addEventListener("message", onMessage);
    window.addEventListener("resize", function() {
      resizeCanvas(window.innerWidth, window.innerHeight);
    });

    resizeCanvas(window.innerWidth, window.innerHeight);
    post({ type: "ready" });
  </script>
</body>
</html>`;

function escapeHtmlPayload(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export default function ReplayCanvasWebView({
  strokes,
  autoplay = true,
  speed = 1,
  showControls = true,
  onReplayEnd,
}: Props) {
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const [visibleCount, setVisibleCount] = useState(autoplay ? 0 : strokes.length);
  const [playing, setPlaying] = useState(autoplay);
  const endSentRef = useRef(false);
  const lastInjectedPayloadRef = useRef("");

  const normalizedStrokes = useMemo(
    () =>
      strokes.map((stroke) => ({
        id: stroke.id,
        uid: stroke.uid,
        color: stroke.color,
        width: stroke.width,
        points: stroke.points.map((point) => ({
          x: point.x,
          y: point.y,
        })),
      })),
    [strokes]
  );

  const injectPayload = (payload: unknown, force = false) => {
    const serialized = escapeHtmlPayload(payload);
    if (!force && lastInjectedPayloadRef.current === serialized) return;
    lastInjectedPayloadRef.current = serialized;
    ref.current?.injectJavaScript(`window.__applyPayload(${serialized}); true;`);
  };

  useEffect(() => {
    return () => {
      lastInjectedPayloadRef.current = "";
    };
  }, []);

  useEffect(() => {
    setVisibleCount(autoplay ? 0 : normalizedStrokes.length);
    setPlaying(autoplay && normalizedStrokes.length > 0);
    endSentRef.current = false;
  }, [autoplay, normalizedStrokes.length]);

  useEffect(() => {
    if (!normalizedStrokes.length || !playing) return;
    if (visibleCount >= normalizedStrokes.length) return;

    const safeSpeed = Math.max(speed, 0.25);
    const intervalMs = Math.max(40, Math.round(110 / safeSpeed));
    const step = Math.max(1, Math.round(safeSpeed));
    const timer = setInterval(() => {
      setVisibleCount((prev) => Math.min(prev + step, normalizedStrokes.length));
    }, intervalMs);

    return () => clearInterval(timer);
  }, [normalizedStrokes.length, playing, speed, visibleCount]);

  useEffect(() => {
    if (!normalizedStrokes.length) return;
    if (visibleCount < normalizedStrokes.length) return;
    if (endSentRef.current) return;

    setPlaying(false);
    endSentRef.current = true;
    onReplayEnd?.();
  }, [normalizedStrokes.length, onReplayEnd, visibleCount]);

  useEffect(() => {
    if (!ready) return;
    injectPayload({
      type: "sync",
      size: canvasSize,
      strokes: normalizedStrokes,
      visibleCount,
    });
  }, [canvasSize, normalizedStrokes, ready, visibleCount]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.max(Math.round(event.nativeEvent.layout.width), 1);
    const nextHeight = Math.max(Math.round(event.nativeEvent.layout.height), 1);
    setCanvasSize((prev) => {
      if (prev.width === nextWidth && prev.height === nextHeight) return prev;
      return { width: nextWidth, height: nextHeight };
    });
  };

  const handleTogglePlay = () => {
    if (!normalizedStrokes.length) return;
    if (visibleCount >= normalizedStrokes.length) {
      endSentRef.current = false;
      setVisibleCount(0);
      setPlaying(true);
      return;
    }
    setPlaying((prev) => !prev);
  };

  const handleRestart = () => {
    endSentRef.current = false;
    setVisibleCount(0);
    setPlaying(normalizedStrokes.length > 0);
  };

  return (
    <View style={styles.card}>
      <View style={styles.canvasShell}>
        <View style={styles.canvasFrame} onLayout={handleLayout}>
          <WebView
            ref={ref}
            style={styles.webview}
            originWhitelist={["*"]}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            bounces={false}
            overScrollMode="never"
            onMessage={(event) => {
              try {
                const payload = JSON.parse(event.nativeEvent.data);
                if (payload?.type === "ready") {
                  setReady(true);
                  injectPayload({
                    type: "init",
                    size: canvasSize,
                    strokes: normalizedStrokes,
                    visibleCount,
                  }, true);
                }
              } catch {}
            }}
            source={{ html: HTML }}
          />
          {!normalizedStrokes.length ? (
            <View pointerEvents="none" style={styles.emptyOverlay}>
              <Text style={styles.emptyText}>Replay появится здесь</Text>
            </View>
          ) : null}
        </View>
      </View>

      {showControls ? (
        <View style={styles.controlsRow}>
          <Pressable onPress={handleTogglePlay} style={styles.primaryButton}>
            <Text style={styles.primaryText}>
              {visibleCount >= normalizedStrokes.length ? "Смотреть заново" : playing ? "Пауза" : "Играть"}
            </Text>
          </Pressable>
          <Pressable onPress={handleRestart} style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>Сначала</Text>
          </Pressable>
          <View style={styles.progressPill}>
            <Text style={styles.progressText}>
              {Math.min(visibleCount, normalizedStrokes.length)}/{normalizedStrokes.length}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.shapes.card,
    padding: 14,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    overflow: "hidden",
  },
  canvasShell: {
    borderRadius: theme.shapes.cardInner,
    overflow: "hidden",
    backgroundColor: theme.colors.backgroundSoft,
  },
  canvasFrame: {
    minHeight: 280,
    backgroundColor: theme.colors.backgroundSoft,
  },
  webview: {
    minHeight: 280,
    backgroundColor: "transparent",
  },
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(5, 8, 22, 0.28)",
  },
  emptyText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "700",
    backgroundColor: "rgba(16, 20, 35, 0.82)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.shapes.pill,
    overflow: "hidden",
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    flexWrap: "wrap",
  },
  primaryButton: {
    borderRadius: theme.shapes.cardInner,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: theme.colors.primary,
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    borderRadius: theme.shapes.cardInner,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  secondaryText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  progressPill: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: theme.colors.accentSoft,
  },
  progressText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
});
