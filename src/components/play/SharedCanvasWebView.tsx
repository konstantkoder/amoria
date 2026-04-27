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
  disabledTitle?: string;
  disabledBody?: string;
  fullscreen?: boolean;
  toolbarAccessory?: React.ReactNode;
  toolLabels?: {
    colors: string;
    brush: string;
    colorNames?: string[];
    brushSizes?: string[];
  };
};

const PALETTE = [
  "#F97393",
  "#FF8A3D",
  "#FACC15",
  "#34D399",
  "#38BDF8",
  "#A78BFA",
  "#F8FAFC",
  "#1F2937",
];
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
      background: #ffffff;
      touch-action: none;
      overscroll-behavior: none;
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
    }

    #root {
      width: 100%;
      height: 100%;
      position: relative;
      overflow: hidden;
      background: #ffffff;
      touch-action: none;
    }

    canvas {
      width: 100%;
      height: 100%;
      display: block;
      touch-action: none;
      background: #ffffff;
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
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
      activePointerId: null,
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

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function getCanvasPoint(event) {
      const rect = canvas.getBoundingClientRect();
      const touch = event.touches && event.touches[0]
        ? event.touches[0]
        : event.changedTouches && event.changedTouches[0]
          ? event.changedTouches[0]
          : event;

      return {
        x: clamp(touch.clientX - rect.left, 0, rect.width),
        y: clamp(touch.clientY - rect.top, 0, rect.height),
      };
    }

    function preventCanvasDefault(event) {
      if (!event) return;
      try {
        event.preventDefault();
      } catch (e) {}
    }

    function makeStrokeId() {
      return "stroke_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    }

    function drawPoint(point, color, width) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(width / 2, 1), 0, Math.PI * 2);
      ctx.fill();
    }

    function drawStrokeSegment(stroke, fromPoint, toPoint) {
      if (!stroke || !fromPoint || !toPoint) return;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(fromPoint.x, fromPoint.y);
      ctx.lineTo(toPoint.x, toPoint.y);
      ctx.stroke();
    }

    function appendCurrentPoint(point) {
      if (!state.currentStroke) return;
      const points = state.currentStroke.points;
      const prev = points[points.length - 1];
      if (!prev) {
        points.push(point);
        drawPoint(point, state.currentStroke.color, state.currentStroke.width);
        return;
      }

      const distance = Math.hypot(point.x - prev.x, point.y - prev.y);
      if (distance < 0.5) return;
      points.push(point);
      drawStrokeSegment(state.currentStroke, prev, point);
    }

    function startStroke(event) {
      preventCanvasDefault(event);
      if (state.disabled) return;
      if (event.pointerId != null) {
        state.activePointerId = event.pointerId;
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch (e) {}
      }
      const point = getCanvasPoint(event);
      state.drawing = true;
      state.currentStroke = {
        id: makeStrokeId(),
        uid: state.localUid,
        color: state.color,
        width: state.width,
        points: [point],
      };
      drawPoint(point, state.color, state.width);
    }

    function moveStroke(event) {
      preventCanvasDefault(event);
      if (!state.drawing || !state.currentStroke) return;
      if (event.pointerId != null && state.activePointerId != null && event.pointerId !== state.activePointerId) {
        return;
      }

      const events = typeof event.getCoalescedEvents === "function"
        ? event.getCoalescedEvents()
        : null;
      const pointEvents = events && events.length ? events : [event];
      for (let i = 0; i < pointEvents.length; i += 1) {
        appendCurrentPoint(getCanvasPoint(pointEvents[i]));
      }
    }

    function finishStroke(event) {
      preventCanvasDefault(event);
      if (!state.drawing || !state.currentStroke) return;
      if (event && event.pointerId != null && state.activePointerId != null && event.pointerId !== state.activePointerId) {
        return;
      }
      if (state.activePointerId != null) {
        try {
          canvas.releasePointerCapture(state.activePointerId);
        } catch (e) {}
      }

      state.drawing = false;
      state.activePointerId = null;
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

    if (window.PointerEvent) {
      canvas.addEventListener("pointerdown", startStroke, { passive: false });
      window.addEventListener("pointermove", moveStroke, { passive: false });
      window.addEventListener("pointerup", finishStroke, { passive: false });
      window.addEventListener("pointercancel", finishStroke, { passive: false });
      canvas.addEventListener("lostpointercapture", finishStroke, { passive: false });
    } else {
      canvas.addEventListener("mousedown", startStroke);
      window.addEventListener("mousemove", moveStroke);
      window.addEventListener("mouseup", finishStroke);
      canvas.addEventListener("touchstart", startStroke, { passive: false });
      window.addEventListener("touchmove", moveStroke, { passive: false });
      window.addEventListener("touchend", finishStroke, { passive: false });
      window.addEventListener("touchcancel", finishStroke, { passive: false });
    }

    document.addEventListener("touchmove", function(event) {
      if (state.drawing || event.target === canvas) preventCanvasDefault(event);
    }, { passive: false });
    document.addEventListener("contextmenu", preventCanvasDefault);
    document.addEventListener("selectstart", preventCanvasDefault);
    document.addEventListener("gesturestart", preventCanvasDefault);

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
  disabledTitle,
  disabledBody,
  fullscreen = false,
  toolbarAccessory,
  toolLabels,
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

  const toolbar = (
    <View style={[styles.toolbar, fullscreen ? styles.toolbarFullscreen : null]}>
        <View style={styles.toolGroup}>
          {toolLabels?.colors ? (
            <Text style={styles.toolLabel}>{toolLabels.colors}</Text>
          ) : null}
          <View style={styles.paletteRow}>
            {PALETTE.map((color, colorIndex) => {
              const active = color === selectedColor;
              return (
                <Pressable
                  key={color}
                  accessibilityRole="button"
                  accessibilityLabel={toolLabels?.colorNames?.[colorIndex] ?? color}
                  disabled={disabled}
                  onPress={() => setSelectedColor(color)}
                  style={[
                    styles.colorButton,
                    { backgroundColor: color },
                    active && styles.colorButtonActive,
                    disabled && styles.toolButtonDisabled,
                  ]}
                />
              );
            })}
          </View>
        </View>
        <View style={styles.toolGroup}>
          {toolLabels?.brush ? (
            <Text style={styles.toolLabel}>{toolLabels.brush}</Text>
          ) : null}
          <View style={styles.brushRow}>
            {BRUSHES.map((width, brushIndex) => {
              const active = width === selectedWidth;
              return (
                <Pressable
                  key={width}
                  accessibilityRole="button"
                  accessibilityLabel={toolLabels?.brushSizes?.[brushIndex] ?? `${width}px`}
                  disabled={disabled}
                  onPress={() => setSelectedWidth(width)}
                  style={[
                    styles.brushButton,
                    active && styles.brushButtonActive,
                    disabled && styles.toolButtonDisabled,
                  ]}
                >
                  <View
                    style={[
                      styles.brushDot,
                      {
                        width,
                        height: width,
                        borderRadius: width / 2,
                      },
                      disabled && styles.brushDotDisabled,
                    ]}
                  />
                  <Text style={styles.brushSizeText}>
                    {toolLabels?.brushSizes?.[brushIndex] ?? `${width}px`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        {toolbarAccessory ? (
          <View style={styles.toolbarAccessory}>{toolbarAccessory}</View>
        ) : null}
      </View>
  );

  const canvas = (
    <View style={[styles.canvasShell, fullscreen ? styles.canvasShellFullscreen : null]}>
        <View
          style={[styles.canvasFrame, fullscreen ? styles.canvasFrameFullscreen : null]}
          onLayout={handleLayout}
        >
          <WebView
            ref={ref}
            style={[styles.webview, fullscreen ? styles.webviewFullscreen : null]}
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
              <View style={styles.disabledCard}>
                <Text style={styles.disabledTitle}>{disabledTitle ?? "Холст закрыт"}</Text>
                {disabledBody ? <Text style={styles.disabledBody}>{disabledBody}</Text> : null}
              </View>
            </View>
          ) : null}
        </View>
      </View>
  );

  return (
    <View style={[styles.card, fullscreen ? styles.cardFullscreen : null]}>
      {fullscreen ? (
        <>
          {canvas}
          {toolbar}
        </>
      ) : (
        <>
          {toolbar}
          {canvas}
        </>
      )}
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
  cardFullscreen: {
    flex: 1,
    padding: 0,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  toolbar: {
    gap: 12,
    marginBottom: 12,
  },
  toolbarFullscreen: {
    marginBottom: 0,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: "rgba(7, 11, 21, 0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  toolGroup: {
    gap: 7,
  },
  toolLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
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
  toolButtonDisabled: {
    opacity: 0.45,
  },
  brushRow: {
    flexDirection: "row",
    gap: 10,
  },
  brushButton: {
    minWidth: 58,
    minHeight: 42,
    borderRadius: theme.shapes.pill,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
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
  brushDotDisabled: {
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  brushSizeText: {
    color: theme.colors.subtext,
    fontSize: 10,
    fontWeight: "800",
  },
  canvasShell: {
    borderRadius: theme.shapes.cardInner,
    overflow: "hidden",
    backgroundColor: theme.colors.backgroundSoft,
  },
  canvasShellFullscreen: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
  },
  canvasFrame: {
    minHeight: 320,
    backgroundColor: theme.colors.backgroundSoft,
  },
  canvasFrameFullscreen: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#FFFFFF",
  },
  webview: {
    backgroundColor: "transparent",
    minHeight: 320,
  },
  webviewFullscreen: {
    flex: 1,
    minHeight: 0,
  },
  toolbarAccessory: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },
  disabledOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(5, 8, 22, 0.42)",
  },
  disabledCard: {
    maxWidth: 260,
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(16, 20, 35, 0.9)",
    borderRadius: theme.shapes.cardInner,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  disabledTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  disabledBody: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
});
