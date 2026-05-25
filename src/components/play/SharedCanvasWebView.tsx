import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";

import { theme } from "@/theme/theme";

export type SharedCanvasPoint = {
  x: number;
  y: number;
};

export type SharedCanvasTool = "draw" | "erase";
export type SharedCanvasMode = SharedCanvasTool | "move";

export type SharedCanvasStroke = {
  id: string;
  uid: string;
  tool?: SharedCanvasTool;
  color: string;
  width: number;
  points: SharedCanvasPoint[];
};

type Props = {
  localUid: string;
  strokes: SharedCanvasStroke[];
  onLocalStrokeBatch?: (strokes: SharedCanvasStroke[]) => void;
  onLoadError?: (message: string) => void;
  onMessageParseError?: (message: string, metadata?: Record<string, unknown>) => void;
  onCanvasControlError?: (
    step: string,
    message: string,
    error?: unknown,
    metadata?: Record<string, unknown>
  ) => void;
  disabled?: boolean;
  disabledTitle?: string;
  disabledBody?: string;
  fullscreen?: boolean;
  toolbarAccessory?: React.ReactNode;
  toolLabels?: {
    colors: string;
    brush: string;
    tools: string;
    brushTool: string;
    eraserTool: string;
    moveTool: string;
    eraser: string;
    zoom: string;
    zoomIn: string;
    zoomOut: string;
    resetZoom: string;
    colorNames?: string[];
    brushSizes?: string[];
    eraserSizes?: string[];
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
const ERASERS = [12, 20, 32];

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
      tool: "draw",
      color: "#F97393",
      width: 6,
      eraserWidth: 20,
      zoom: 1,
      panX: 0,
      panY: 0,
      canvasWidth: 1,
      canvasHeight: 1,
      strokesMap: {},
      strokeOrder: [],
      drawing: false,
      panning: false,
      currentStroke: null,
      activePointerId: null,
      lastPanPoint: null,
    };

    const LEGACY_CANVAS_WIDTH = 390;
    const LEGACY_CANVAS_HEIGHT = 560;

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function cloneRawPoint(point) {
      return { x: Number(point && point.x ? point.x : 0), y: Number(point && point.y ? point.y : 0) };
    }

    function isNormalizedPoint(point) {
      return point.x >= -0.02 && point.x <= 1.02 && point.y >= -0.02 && point.y <= 1.02;
    }

    function getStrokeCoordinateSpace(points) {
      if (!points.length) return "normalized";
      return points.every(isNormalizedPoint) ? "normalized" : "legacy_pixels";
    }

    function normalizePoint(point, legacyBounds) {
      if (isNormalizedPoint(point)) {
        return {
          x: clamp(point.x, 0, 1),
          y: clamp(point.y, 0, 1),
        };
      }

      const width = Math.max(Number(legacyBounds && legacyBounds.width) || LEGACY_CANVAS_WIDTH, 1);
      const height = Math.max(Number(legacyBounds && legacyBounds.height) || LEGACY_CANVAS_HEIGHT, 1);
      return {
        x: clamp(point.x / width, 0, 1),
        y: clamp(point.y / height, 0, 1),
      };
    }

    function toCanvasPoint(point) {
      return {
        x: clamp(point.x, 0, 1) * state.canvasWidth,
        y: clamp(point.y, 0, 1) * state.canvasHeight,
      };
    }

    function normalizeTool(value) {
      return value === "erase" ? "erase" : "draw";
    }

    function normalizeStroke(stroke, legacyBounds) {
      const rawPoints = Array.isArray(stroke && stroke.points)
        ? stroke.points.map(cloneRawPoint)
        : [];
      return {
        id: String(stroke && stroke.id ? stroke.id : ""),
        uid: String(stroke && stroke.uid ? stroke.uid : ""),
        tool: normalizeTool(stroke && stroke.tool),
        color: String(stroke && stroke.color ? stroke.color : "#F97393"),
        width: Number(stroke && stroke.width ? stroke.width : 6),
        coordinateSpace: getStrokeCoordinateSpace(rawPoints),
        points: rawPoints.map((point) => normalizePoint(point, legacyBounds)),
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
      state.canvasWidth = width;
      state.canvasHeight = height;
      const nextPan = clampPanValues(state.panX, state.panY, state.zoom);
      state.panX = nextPan.x;
      state.panY = nextPan.y;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      redraw();
    }

    function withViewportTransform(callback) {
      ctx.save();
      ctx.translate(state.panX, state.panY);
      ctx.scale(state.zoom, state.zoom);
      callback();
      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
    }

    function setStrokePaint(stroke) {
      const erase = normalizeTool(stroke && stroke.tool) === "erase";
      ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
      ctx.strokeStyle = erase ? "rgba(0,0,0,1)" : stroke.color;
      ctx.fillStyle = erase ? "rgba(0,0,0,1)" : stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }

    function drawStroke(stroke) {
      if (!stroke || !stroke.points || !stroke.points.length) return;

      withViewportTransform(function() {
        const points = stroke.points.map(toCanvasPoint);
        setStrokePaint(stroke);

        if (points.length === 1) {
          const point = points[0];
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
      });
    }

    function redraw() {
      ctx.clearRect(0, 0, state.canvasWidth, state.canvasHeight);
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
      const legacyBoundsByUid = {};

      for (let i = 0; i < list.length; i += 1) {
        const rawStroke = list[i];
        const rawPoints = Array.isArray(rawStroke && rawStroke.points)
          ? rawStroke.points.map(cloneRawPoint)
          : [];
        if (getStrokeCoordinateSpace(rawPoints) !== "legacy_pixels") continue;
        const uid = String(rawStroke && rawStroke.uid ? rawStroke.uid : "");
        const bounds = legacyBoundsByUid[uid] || {
          width: LEGACY_CANVAS_WIDTH,
          height: LEGACY_CANVAS_HEIGHT,
        };
        for (let pointIndex = 0; pointIndex < rawPoints.length; pointIndex += 1) {
          bounds.width = Math.max(bounds.width, rawPoints[pointIndex].x);
          bounds.height = Math.max(bounds.height, rawPoints[pointIndex].y);
        }
        legacyBoundsByUid[uid] = bounds;
      }

      for (let i = 0; i < list.length; i += 1) {
        const rawStroke = list[i];
        const uid = String(rawStroke && rawStroke.uid ? rawStroke.uid : "");
        const stroke = normalizeStroke(rawStroke, legacyBoundsByUid[uid]);
        if (!stroke.id || seen[stroke.id]) continue;
        seen[stroke.id] = true;
        nextMap[stroke.id] = stroke;
        nextOrder.push(stroke.id);
      }

      state.strokesMap = nextMap;
      state.strokeOrder = nextOrder;
      redraw();
    }

    function getEventClientPoint(event) {
      const rect = canvas.getBoundingClientRect();
      const touch = event.touches && event.touches[0]
        ? event.touches[0]
        : event.changedTouches && event.changedTouches[0]
          ? event.changedTouches[0]
          : event;

      return {
        x: Number(touch.clientX || 0),
        y: Number(touch.clientY || 0),
        rect,
      };
    }

    function getNormalizedCanvasPoint(event) {
      const point = getEventClientPoint(event);
      const rect = point.rect;
      const localX = point.x - rect.left;
      const localY = point.y - rect.top;
      const logicalX = (localX - state.panX) / Math.max(state.zoom, 0.1);
      const logicalY = (localY - state.panY) / Math.max(state.zoom, 0.1);

      return {
        x: rect.width > 0 ? clamp(logicalX / rect.width, 0, 1) : 0,
        y: rect.height > 0 ? clamp(logicalY / rect.height, 0, 1) : 0,
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
      const stroke = state.currentStroke || { tool: "draw", color: color, width: width };
      withViewportTransform(function() {
        const canvasPoint = toCanvasPoint(point);
        setStrokePaint(stroke);
        ctx.beginPath();
        ctx.arc(canvasPoint.x, canvasPoint.y, Math.max(width / 2, 1), 0, Math.PI * 2);
        ctx.fill();
      });
    }

    function drawStrokeSegment(stroke, fromPoint, toPoint) {
      if (!stroke || !fromPoint || !toPoint) return;
      withViewportTransform(function() {
        const fromCanvasPoint = toCanvasPoint(fromPoint);
        const toCanvasPointValue = toCanvasPoint(toPoint);
        setStrokePaint(stroke);
        ctx.beginPath();
        ctx.moveTo(fromCanvasPoint.x, fromCanvasPoint.y);
        ctx.lineTo(toCanvasPointValue.x, toCanvasPointValue.y);
        ctx.stroke();
      });
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

      const distance = Math.hypot(
        (point.x - prev.x) * state.canvasWidth,
        (point.y - prev.y) * state.canvasHeight
      );
      if (distance < 0.75) return;
      points.push(point);
      drawStrokeSegment(state.currentStroke, prev, point);
    }

    function clampPanValues(panX, panY, zoom) {
      const safeZoom = Math.max(zoom, 1);
      if (safeZoom <= 1.01) {
        return { x: 0, y: 0 };
      }

      const minX = Math.min(0, state.canvasWidth - state.canvasWidth * safeZoom);
      const minY = Math.min(0, state.canvasHeight - state.canvasHeight * safeZoom);
      return {
        x: clamp(panX, minX, 0),
        y: clamp(panY, minY, 0),
      };
    }

    function setViewport(nextZoom, nextPanX, nextPanY) {
      state.zoom = clamp(Number(nextZoom) || 1, 1, 4);
      const nextPan = clampPanValues(Number(nextPanX) || 0, Number(nextPanY) || 0, state.zoom);
      state.panX = nextPan.x;
      state.panY = nextPan.y;
      redraw();
    }

    function zoomBy(factor) {
      const oldZoom = state.zoom;
      const nextZoom = clamp(oldZoom * factor, 1, 4);
      const centerX = state.canvasWidth / 2;
      const centerY = state.canvasHeight / 2;
      const logicalCenterX = (centerX - state.panX) / oldZoom;
      const logicalCenterY = (centerY - state.panY) / oldZoom;
      setViewport(
        nextZoom,
        centerX - logicalCenterX * nextZoom,
        centerY - logicalCenterY * nextZoom
      );
    }

    function resetViewport() {
      setViewport(1, 0, 0);
    }

    function startPan(event) {
      preventCanvasDefault(event);
      if (state.disabled) return;
      if (event.pointerId != null) {
        state.activePointerId = event.pointerId;
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch (e) {}
      }
      const point = getEventClientPoint(event);
      state.panning = true;
      state.lastPanPoint = { x: point.x, y: point.y };
    }

    function movePan(event) {
      preventCanvasDefault(event);
      if (!state.panning || !state.lastPanPoint) return;
      if (event.pointerId != null && state.activePointerId != null && event.pointerId !== state.activePointerId) {
        return;
      }

      const point = getEventClientPoint(event);
      const dx = point.x - state.lastPanPoint.x;
      const dy = point.y - state.lastPanPoint.y;
      state.lastPanPoint = { x: point.x, y: point.y };
      setViewport(state.zoom, state.panX + dx, state.panY + dy);
    }

    function finishPan(event) {
      preventCanvasDefault(event);
      if (!state.panning) return;
      if (event && event.pointerId != null && state.activePointerId != null && event.pointerId !== state.activePointerId) {
        return;
      }
      if (state.activePointerId != null) {
        try {
          canvas.releasePointerCapture(state.activePointerId);
        } catch (e) {}
      }
      state.panning = false;
      state.activePointerId = null;
      state.lastPanPoint = null;
    }

    function startStroke(event) {
      preventCanvasDefault(event);
      if (state.disabled) return;
      if (state.tool === "move") {
        startPan(event);
        return;
      }
      if (event.pointerId != null) {
        state.activePointerId = event.pointerId;
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch (e) {}
      }
      const point = getNormalizedCanvasPoint(event);
      const tool = normalizeTool(state.tool);
      const width = tool === "erase" ? state.eraserWidth : state.width;
      state.drawing = true;
      state.currentStroke = {
        id: makeStrokeId(),
        uid: state.localUid,
        tool: tool,
        color: tool === "erase" ? "#FFFFFF" : state.color,
        width: width,
        coordinateSpace: "normalized",
        points: [point],
      };
      drawPoint(point, state.currentStroke.color, state.currentStroke.width);
    }

    function moveStroke(event) {
      preventCanvasDefault(event);
      if (state.panning) {
        movePan(event);
        return;
      }
      if (!state.drawing || !state.currentStroke) return;
      if (event.pointerId != null && state.activePointerId != null && event.pointerId !== state.activePointerId) {
        return;
      }

      const events = typeof event.getCoalescedEvents === "function"
        ? event.getCoalescedEvents()
        : null;
      const pointEvents = events && events.length ? events : [event];
      for (let i = 0; i < pointEvents.length; i += 1) {
        appendCurrentPoint(getNormalizedCanvasPoint(pointEvents[i]));
      }
    }

    function finishStroke(event) {
      preventCanvasDefault(event);
      if (state.panning) {
        finishPan(event);
        return;
      }
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
        if (data.tool) state.tool = data.tool === "move" ? "move" : normalizeTool(data.tool);
        if (data.color) state.color = String(data.color);
        if (data.width) state.width = Number(data.width);
        if (data.eraserWidth) state.eraserWidth = Number(data.eraserWidth);
        if (data.size) resizeCanvas(data.size.width, data.size.height);
        if (Array.isArray(data.strokes)) upsertStrokes(data.strokes);
        return;
      }

      if (data.type === "tool") {
        if (data.tool) state.tool = data.tool === "move" ? "move" : normalizeTool(data.tool);
        if (data.color) state.color = String(data.color);
        if (data.width) state.width = Number(data.width);
        if (data.eraserWidth) state.eraserWidth = Number(data.eraserWidth);
        if (typeof data.disabled === "boolean") state.disabled = data.disabled;
        return;
      }

      if (data.type === "viewport") {
        if (data.action === "zoomIn") zoomBy(1.25);
        if (data.action === "zoomOut") zoomBy(0.8);
        if (data.action === "reset") resetViewport();
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
      if (state.drawing || state.panning || event.target === canvas) preventCanvasDefault(event);
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
  onLoadError,
  onMessageParseError,
  onCanvasControlError,
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
  const [selectedTool, setSelectedTool] = useState<SharedCanvasMode>("draw");
  const [selectedColor, setSelectedColor] = useState(PALETTE[0]);
  const [selectedWidth, setSelectedWidth] = useState(BRUSHES[1]);
  const [selectedEraserWidth, setSelectedEraserWidth] = useState(ERASERS[1]);
  const lastInjectedPayloadRef = useRef("");

  const normalizedStrokes = useMemo(
    () =>
      strokes.map((stroke) => ({
        id: stroke.id,
        uid: stroke.uid,
        tool: stroke.tool ?? "draw",
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
      tool: selectedTool,
      color: selectedColor,
      width: selectedWidth,
      eraserWidth: selectedEraserWidth,
      size: canvasSize,
      strokes: normalizedStrokes,
    });
  }, [
    ready,
    localUid,
    disabled,
    selectedTool,
    selectedColor,
    selectedWidth,
    selectedEraserWidth,
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

  const reportControlError = (
    step: string,
    message: string,
    error?: unknown,
    metadata: Record<string, unknown> = {}
  ) => {
    onCanvasControlError?.(step, message, error, {
      tool: selectedTool,
      ...metadata,
    });
  };

  const applyTool = (tool: SharedCanvasMode) => {
    try {
      setSelectedTool(tool);
      injectPayload({
        type: "tool",
        tool,
        color: selectedColor,
        width: selectedWidth,
        eraserWidth: selectedEraserWidth,
        disabled,
      }, true);
    } catch (error) {
      reportControlError("canvasToolSwitchFailed", "Failed to switch Together canvas tool", error, {
        nextTool: tool,
      });
    }
  };

  const applyColor = (color: string) => {
    try {
      setSelectedColor(color);
      setSelectedTool("draw");
      injectPayload({
        type: "tool",
        tool: "draw",
        color,
        width: selectedWidth,
        eraserWidth: selectedEraserWidth,
        disabled,
      }, true);
    } catch (error) {
      reportControlError("canvasToolSwitchFailed", "Failed to switch Together canvas color", error, {
        nextTool: "draw",
      });
    }
  };

  const applyBrushWidth = (width: number) => {
    try {
      setSelectedWidth(width);
      setSelectedTool("draw");
      injectPayload({
        type: "tool",
        tool: "draw",
        color: selectedColor,
        width,
        eraserWidth: selectedEraserWidth,
        disabled,
      }, true);
    } catch (error) {
      reportControlError("canvasToolSwitchFailed", "Failed to switch Together canvas brush size", error, {
        nextTool: "draw",
      });
    }
  };

  const applyEraserWidth = (width: number) => {
    try {
      setSelectedEraserWidth(width);
      setSelectedTool("erase");
      injectPayload({
        type: "tool",
        tool: "erase",
        color: selectedColor,
        width: selectedWidth,
        eraserWidth: width,
        disabled,
      }, true);
    } catch (error) {
      reportControlError("canvasToolSwitchFailed", "Failed to switch Together canvas eraser size", error, {
        nextTool: "erase",
      });
    }
  };

  const applyViewportAction = (action: "zoomIn" | "zoomOut" | "reset") => {
    try {
      injectPayload({ type: "viewport", action }, true);
    } catch (error) {
      reportControlError("canvasTransformFailed", "Failed to transform Together canvas viewport", error, {
        viewportAction: action,
      });
    }
  };

  const toolOptions = [
    { mode: "draw", label: toolLabels?.brushTool ?? "Brush", icon: "brush-outline" },
    { mode: "erase", label: toolLabels?.eraserTool ?? "Eraser", icon: "remove-circle-outline" },
    { mode: "move", label: toolLabels?.moveTool ?? "Move", icon: "move-outline" },
  ] as const;

  const toolbar = (
    <View style={[styles.toolbar, fullscreen ? styles.toolbarFullscreen : null]}>
      <View style={[styles.toolGroup, fullscreen ? styles.toolGroupFullscreen : null]}>
        {toolLabels?.tools && !fullscreen ? (
          <Text style={styles.toolLabel}>{toolLabels.tools}</Text>
        ) : null}
        <View style={styles.modeRow}>
          {toolOptions.map((option) => {
            const active = selectedTool === option.mode;
            return (
              <Pressable
                key={option.mode}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                disabled={disabled}
                onPress={() => applyTool(option.mode)}
                style={[
                  styles.modeButton,
                  fullscreen ? styles.modeButtonFullscreen : null,
                  active && styles.modeButtonActive,
                  disabled && styles.toolButtonDisabled,
                ]}
              >
                <Ionicons
                  name={option.icon}
                  size={fullscreen ? 17 : 18}
                  color={active ? theme.colors.text : theme.colors.subtext}
                />
                <Text style={[styles.modeButtonText, active && styles.modeButtonTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.toolGroup, fullscreen ? styles.toolGroupFullscreen : null]}>
        {toolLabels?.colors && !fullscreen ? (
          <Text style={styles.toolLabel}>{toolLabels.colors}</Text>
        ) : null}
        <View style={[styles.colorRow, fullscreen ? styles.colorRowFullscreen : null]}>
          {PALETTE.map((color, colorIndex) => {
            const active = selectedTool === "draw" && color === selectedColor;
            return (
              <Pressable
                key={color}
                accessibilityRole="button"
                accessibilityLabel={toolLabels?.colorNames?.[colorIndex] ?? color}
                disabled={disabled}
                onPress={() => applyColor(color)}
                style={[
                  styles.colorButton,
                  fullscreen ? styles.colorButtonFullscreen : null,
                  { backgroundColor: color },
                  active && styles.colorButtonActive,
                  disabled && styles.toolButtonDisabled,
                ]}
              />
            );
          })}
        </View>
      </View>

      <View style={styles.sizeGrid}>
        <View style={[styles.toolGroup, fullscreen ? styles.toolGroupFullscreen : null]}>
          {toolLabels?.brush && !fullscreen ? (
            <Text style={styles.toolLabel}>{toolLabels.brush}</Text>
          ) : null}
          <View style={[styles.brushRow, fullscreen ? styles.brushRowFullscreen : null]}>
            {BRUSHES.map((width, brushIndex) => {
              const active = selectedTool === "draw" && width === selectedWidth;
              return (
                <Pressable
                  key={width}
                  accessibilityRole="button"
                  accessibilityLabel={toolLabels?.brushSizes?.[brushIndex] ?? `${width}px`}
                  disabled={disabled}
                  onPress={() => applyBrushWidth(width)}
                  style={[
                    styles.brushButton,
                    fullscreen ? styles.brushButtonFullscreen : null,
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
                  {!fullscreen ? (
                    <Text style={styles.brushSizeText}>
                      {toolLabels?.brushSizes?.[brushIndex] ?? `${width}px`}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.toolGroup, fullscreen ? styles.toolGroupFullscreen : null]}>
          {toolLabels?.eraser && !fullscreen ? (
            <Text style={styles.toolLabel}>{toolLabels.eraser}</Text>
          ) : null}
          <View style={[styles.brushRow, fullscreen ? styles.brushRowFullscreen : null]}>
            {ERASERS.map((width, eraserIndex) => {
              const active = selectedTool === "erase" && width === selectedEraserWidth;
              return (
                <Pressable
                  key={width}
                  accessibilityRole="button"
                  accessibilityLabel={toolLabels?.eraserSizes?.[eraserIndex] ?? `${width}px`}
                  disabled={disabled}
                  onPress={() => applyEraserWidth(width)}
                  style={[
                    styles.brushButton,
                    fullscreen ? styles.brushButtonFullscreen : null,
                    active && styles.brushButtonActive,
                    disabled && styles.toolButtonDisabled,
                  ]}
                >
                  <View
                    style={[
                      styles.eraserDot,
                      {
                        width: Math.max(8, width / 2),
                        height: Math.max(8, width / 2),
                        borderRadius: Math.max(4, width / 4),
                      },
                    ]}
                  />
                  {!fullscreen ? (
                    <Text style={styles.brushSizeText}>
                      {toolLabels?.eraserSizes?.[eraserIndex] ?? `${width}px`}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <View style={[styles.toolGroup, fullscreen ? styles.toolGroupFullscreen : null]}>
        {toolLabels?.zoom && !fullscreen ? (
          <Text style={styles.toolLabel}>{toolLabels.zoom}</Text>
        ) : null}
        <View style={styles.zoomRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={toolLabels?.zoomOut ?? "Zoom out"}
            disabled={disabled}
            onPress={() => applyViewportAction("zoomOut")}
            style={[styles.zoomButton, disabled && styles.toolButtonDisabled]}
          >
            <Text style={styles.zoomButtonText}>−</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={toolLabels?.zoomIn ?? "Zoom in"}
            disabled={disabled}
            onPress={() => applyViewportAction("zoomIn")}
            style={[styles.zoomButton, disabled && styles.toolButtonDisabled]}
          >
            <Text style={styles.zoomButtonText}>+</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={toolLabels?.resetZoom ?? "Reset zoom"}
            disabled={disabled}
            onPress={() => applyViewportAction("reset")}
            style={[styles.resetZoomButton, disabled && styles.toolButtonDisabled]}
          >
            <Text style={styles.resetZoomText}>{toolLabels?.resetZoom ?? "Reset"}</Text>
          </Pressable>
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
            onError={(event) => {
              onLoadError?.(event.nativeEvent.description || "canvas_webview_load_failed");
            }}
            onHttpError={(event) => {
              onLoadError?.(`HTTP ${event.nativeEvent.statusCode}`);
            }}
            onMessage={(event) => {
              try {
                const payload = JSON.parse(event.nativeEvent.data);
                if (payload?.type === "ready") {
                  setReady(true);
                  injectPayload({
                    type: "init",
                    localUid,
                    disabled,
                    tool: selectedTool,
                    color: selectedColor,
                    width: selectedWidth,
                    eraserWidth: selectedEraserWidth,
                    size: canvasSize,
                    strokes: normalizedStrokes,
                  }, true);
                  return;
                }
                if (payload?.type === "stroke_batch" && Array.isArray(payload.strokes)) {
                  onLocalStrokeBatch?.(payload.strokes as SharedCanvasStroke[]);
                }
              } catch {
                onMessageParseError?.("canvas_webview_message_parse_failed", {
                  tool: selectedTool,
                });
              }
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
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(7, 11, 21, 0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    gap: 8,
  },
  toolGroup: {
    gap: 7,
  },
  toolGroupFullscreen: {
    gap: 0,
  },
  toolLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  modeButton: {
    minHeight: 42,
    minWidth: 86,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: theme.shapes.cardInner,
    paddingHorizontal: 10,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: "transparent",
  },
  modeButtonFullscreen: {
    minHeight: 34,
    minWidth: 72,
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  modeButtonActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
  },
  modeButtonText: {
    color: theme.colors.subtext,
    fontSize: 12,
    fontWeight: "800",
  },
  modeButtonTextActive: {
    color: theme.colors.text,
  },
  colorRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  colorRowFullscreen: {
    gap: 7,
  },
  colorButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorButtonFullscreen: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  colorButtonActive: {
    borderColor: "#FFFFFF",
  },
  toolButtonDisabled: {
    opacity: 0.45,
  },
  sizeGrid: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  brushRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  brushRowFullscreen: {
    gap: 7,
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
  brushButtonFullscreen: {
    minWidth: 42,
    minHeight: 32,
    borderRadius: 8,
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
  eraserDot: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(31,41,55,0.45)",
  },
  brushSizeText: {
    color: theme.colors.subtext,
    fontSize: 10,
    fontWeight: "800",
  },
  zoomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  zoomButton: {
    minWidth: 42,
    minHeight: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  zoomButtonText: {
    color: theme.colors.text,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "900",
  },
  resetZoomButton: {
    minHeight: 38,
    borderRadius: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  resetZoomText: {
    color: theme.colors.text,
    fontSize: 12,
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
    gap: 8,
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
