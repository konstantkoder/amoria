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

export type SharedCanvasPoint = {
  x: number;
  y: number;
};

export type SharedCanvasStroke = {
  id: string;
  uid: string;
  color: string;
  width: number;
  points: SharedCanvasPoint[];
};

type Props = {
  localUid: string;
  strokes: SharedCanvasStroke[];
  onLocalStrokeBatch?: (strokes: SharedCanvasStroke[]) => void;
  disabled?: boolean;
};

const PALETTE = ["#F97393", "#FF8A3D", "#FACC15", "#34D399", "#38BDF8", "#A78BFA"];
const BRUSHES = [3, 6, 10];

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
      touch-action: none;
    }

    #root {
      width: 100%;
      height: 100%;
      position: relative;
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
      touch-action: none;
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
      localUid: "",
      disabled: false,
      color: "#F97393",
      width: 6,
      strokesMap: {},
      strokeOrder: [],
      drawing: false,
      currentStroke: null,
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
      for (let i = 0; i < state.strokeOrder.length; i += 1) {
        const stroke = state.strokesMap[state.strokeOrder[i]];
        drawStroke(stroke);
      }
      if (state.currentStroke) drawStroke(state.currentStroke);
    }

    function upsertStrokes(strokes) {
      const list = Array.isArray(strokes) ? strokes : [];
      const seen = {};
      const nextMap = {};
      const nextOrder = [];

      for (let i = 0; i < list.length; i += 1) {
        const stroke = normalizeStroke(list[i]);
        if (!stroke.id || seen[stroke.id]) continue;
        seen[stroke.id] = true;
        nextMap[stroke.id] = stroke;
        nextOrder.push(stroke.id);
      }

      state.strokesMap = nextMap;
      state.strokeOrder = nextOrder;
      redraw();
    }

    function getCanvasPoint(event) {
      const rect = canvas.getBoundingClientRect();
      const touch = event.touches && event.touches[0]
        ? event.touches[0]
        : event.changedTouches && event.changedTouches[0]
          ? event.changedTouches[0]
          : event;

      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    }

    function makeStrokeId() {
      return "stroke_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    }

    function startStroke(event) {
      if (state.disabled) return;
      const point = getCanvasPoint(event);
      state.drawing = true;
      state.currentStroke = {
        id: makeStrokeId(),
        uid: state.localUid,
        color: state.color,
        width: state.width,
        points: [point],
      };
      redraw();
      event.preventDefault();
    }

    function moveStroke(event) {
      if (!state.drawing || !state.currentStroke) return;
      const point = getCanvasPoint(event);
      const points = state.currentStroke.points;
      const prev = points[points.length - 1];
      if (!prev || prev.x !== point.x || prev.y !== point.y) {
        points.push(point);
        redraw();
      }
      event.preventDefault();
    }

    function finishStroke(event) {
      if (!state.drawing || !state.currentStroke) return;
      if (event) event.preventDefault();

      state.drawing = false;
      const stroke = normalizeStroke(state.currentStroke);
      state.currentStroke = null;

      if (!stroke.points.length) {
        redraw();
        return;
      }

      state.strokesMap[stroke.id] = stroke;
      if (state.strokeOrder.indexOf(stroke.id) === -1) {
        state.strokeOrder.push(stroke.id);
      }
      redraw();
      post({ type: "stroke_batch", strokes: [stroke] });
    }

    function applyPayload(data) {
      if (!data) return;

      if (data.type === "init" || data.type === "sync") {
        state.localUid = String(data.localUid || state.localUid || "");
        state.disabled = Boolean(data.disabled);
        if (data.color) state.color = String(data.color);
        if (data.width) state.width = Number(data.width);
        if (data.size) resizeCanvas(data.size.width, data.size.height);
        if (Array.isArray(data.strokes)) upsertStrokes(data.strokes);
        return;
      }

      if (data.type === "tool") {
        if (data.color) state.color = String(data.color);
        if (data.width) state.width = Number(data.width);
        if (typeof data.disabled === "boolean") state.disabled = data.disabled;
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

    canvas.addEventListener("mousedown", startStroke);
    canvas.addEventListener("mousemove", moveStroke);
    window.addEventListener("mouseup", finishStroke);
    canvas.addEventListener("mouseleave", finishStroke);

    canvas.addEventListener("touchstart", startStroke, { passive: false });
    canvas.addEventListener("touchmove", moveStroke, { passive: false });
    canvas.addEventListener("touchend", finishStroke, { passive: false });
    canvas.addEventListener("touchcancel", finishStroke, { passive: false });

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

export default function SharedCanvasWebView({
  localUid,
  strokes,
  onLocalStrokeBatch,
  disabled = false,
}: Props) {
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const [selectedColor, setSelectedColor] = useState(PALETTE[0]);
  const [selectedWidth, setSelectedWidth] = useState(BRUSHES[1]);
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
    if (!ready) return;
    injectPayload({
      type: "sync",
      localUid,
      disabled,
      color: selectedColor,
      width: selectedWidth,
      size: canvasSize,
      strokes: normalizedStrokes,
    });
  }, [
    ready,
    localUid,
    disabled,
    selectedColor,
    selectedWidth,
    canvasSize.height,
    canvasSize.width,
    normalizedStrokes,
  ]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.max(Math.round(event.nativeEvent.layout.width), 1);
    const nextHeight = Math.max(Math.round(event.nativeEvent.layout.height), 1);
    setCanvasSize((prev) => {
      if (prev.width === nextWidth && prev.height === nextHeight) return prev;
      return { width: nextWidth, height: nextHeight };
    });
  };

  return (
    <View style={styles.card}>
      <View style={styles.toolbar}>
        <View style={styles.paletteRow}>
          {PALETTE.map((color) => {
            const active = color === selectedColor;
            return (
              <Pressable
                key={color}
                accessibilityRole="button"
                onPress={() => setSelectedColor(color)}
                style={[
                  styles.colorButton,
                  { backgroundColor: color },
                  active && styles.colorButtonActive,
                ]}
              />
            );
          })}
        </View>
        <View style={styles.brushRow}>
          {BRUSHES.map((width) => {
            const active = width === selectedWidth;
            return (
              <Pressable
                key={width}
                accessibilityRole="button"
                onPress={() => setSelectedWidth(width)}
                style={[styles.brushButton, active && styles.brushButtonActive]}
              >
                <View
                  style={[
                    styles.brushDot,
                    {
                      width,
                      height: width,
                      borderRadius: width / 2,
                    },
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
      </View>

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
                    localUid,
                    disabled,
                    color: selectedColor,
                    width: selectedWidth,
                    size: canvasSize,
                    strokes: normalizedStrokes,
                  }, true);
                  return;
                }
                if (payload?.type === "stroke_batch" && Array.isArray(payload.strokes)) {
                  onLocalStrokeBatch?.(payload.strokes as SharedCanvasStroke[]);
                }
              } catch {}
            }}
            source={{ html: HTML }}
          />
          {disabled ? (
            <View pointerEvents="none" style={styles.disabledOverlay}>
              <Text style={styles.disabledText}>Canvas locked</Text>
            </View>
          ) : null}
        </View>
      </View>
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
    shadowColor: "#000000",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    overflow: "hidden",
  },
  toolbar: {
    gap: 12,
    marginBottom: 12,
  },
  paletteRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  colorButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorButtonActive: {
    borderColor: "#FFFFFF",
  },
  brushRow: {
    flexDirection: "row",
    gap: 10,
  },
  brushButton: {
    minWidth: 44,
    height: 34,
    borderRadius: theme.shapes.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: "transparent",
  },
  brushButtonActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
  },
  brushDot: {
    backgroundColor: theme.colors.text,
  },
  canvasShell: {
    borderRadius: theme.shapes.cardInner,
    overflow: "hidden",
    backgroundColor: theme.colors.backgroundSoft,
  },
  canvasFrame: {
    minHeight: 320,
    backgroundColor: theme.colors.backgroundSoft,
  },
  webview: {
    backgroundColor: "transparent",
    minHeight: 320,
  },
  disabledOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(5, 8, 22, 0.35)",
  },
  disabledText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "600",
    backgroundColor: "rgba(16, 20, 35, 0.84)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.shapes.pill,
    overflow: "hidden",
  },
});
