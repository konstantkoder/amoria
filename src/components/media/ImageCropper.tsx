import React from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "@/theme";

export type NormalizedMediaCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CropImageSource = {
  uri: string;
  width?: number;
  height?: number;
  mimeType?: string;
};

type CropperErrorStep = "cropOpenFailed" | "cropConfirmFailed" | "cropInvalid";

type ImageCropperProps = {
  visible: boolean;
  source: CropImageSource | null;
  title: string;
  helpText: string;
  doneLabel: string;
  cancelLabel: string;
  chooseAnotherLabel: string;
  resetLabel: string;
  onDone: (crop: NormalizedMediaCrop) => void;
  onCancel: () => void;
  onChooseAnother: () => void;
  onError?: (
    step: CropperErrorStep,
    error?: unknown,
    metadata?: Record<string, unknown>
  ) => void;
};

type CroppedPreviewProps = {
  uri: string;
  crop?: NormalizedMediaCrop;
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
  onError?: () => void;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function distanceBetweenTouches(touches: readonly { pageX: number; pageY: number }[]) {
  if (touches.length < 2 || !touches[0] || !touches[1]) return 1;
  return Math.max(
    Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY),
    1
  );
}

function cropIsValid(crop: NormalizedMediaCrop | null | undefined) {
  if (!crop) return false;
  return (
    Number.isFinite(crop.x) &&
    Number.isFinite(crop.y) &&
    Number.isFinite(crop.width) &&
    Number.isFinite(crop.height) &&
    crop.x >= 0 &&
    crop.y >= 0 &&
    crop.width > 0 &&
    crop.height > 0 &&
    crop.x + crop.width <= 1.000001 &&
    crop.y + crop.height <= 1.000001
  );
}

export default function ImageCropper({
  visible,
  source,
  title,
  helpText,
  doneLabel,
  cancelLabel,
  chooseAnotherLabel,
  resetLabel,
  onDone,
  onCancel,
  onChooseAnother,
  onError,
}: ImageCropperProps) {
  const insets = useSafeAreaInsets();
  const [frameSize, setFrameSize] = React.useState(0);
  const [loadedSize, setLoadedSize] = React.useState<{ width: number; height: number } | null>(
    null
  );
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const gestureRef = React.useRef({
    pan: { x: 0, y: 0 },
    zoom: 1,
    distance: 1,
  });

  React.useEffect(() => {
    if (!visible) return;
    setPan({ x: 0, y: 0 });
    setZoom(1);
    const width = Number(source?.width ?? 0);
    const height = Number(source?.height ?? 0);
    if (width > 0 && height > 0) {
      setLoadedSize({ width, height });
      return;
    }

    setLoadedSize(null);
    if (!source?.uri) return;
    Image.getSize(
      source.uri,
      (nextWidth, nextHeight) => {
        setLoadedSize({ width: nextWidth, height: nextHeight });
      },
      (error) => {
        onError?.("cropOpenFailed", error, {
          sourceMimeType: source.mimeType ?? null,
        });
      }
    );
  }, [onError, source?.height, source?.mimeType, source?.uri, source?.width, visible]);

  const imageMetrics = React.useMemo(() => {
    if (!loadedSize || frameSize <= 0) return null;
    const baseScale = Math.max(frameSize / loadedSize.width, frameSize / loadedSize.height);
    const width = loadedSize.width * baseScale * zoom;
    const height = loadedSize.height * baseScale * zoom;
    const maxPanX = Math.max((width - frameSize) / 2, 0);
    const maxPanY = Math.max((height - frameSize) / 2, 0);
    const clampedPan = {
      x: clamp(pan.x, -maxPanX, maxPanX),
      y: clamp(pan.y, -maxPanY, maxPanY),
    };

    return {
      width,
      height,
      left: (frameSize - width) / 2 + clampedPan.x,
      top: (frameSize - height) / 2 + clampedPan.y,
      maxPanX,
      maxPanY,
      clampedPan,
    };
  }, [frameSize, loadedSize, pan.x, pan.y, zoom]);

  React.useEffect(() => {
    if (!imageMetrics) return;
    if (imageMetrics.clampedPan.x === pan.x && imageMetrics.clampedPan.y === pan.y) return;
    setPan(imageMetrics.clampedPan);
  }, [imageMetrics, pan.x, pan.y]);

  const currentCrop = React.useMemo<NormalizedMediaCrop | null>(() => {
    if (!imageMetrics || frameSize <= 0) return null;
    return {
      x: clamp(-imageMetrics.left / imageMetrics.width, 0, 1),
      y: clamp(-imageMetrics.top / imageMetrics.height, 0, 1),
      width: clamp(frameSize / imageMetrics.width, 0, 1),
      height: clamp(frameSize / imageMetrics.height, 0, 1),
    };
  }, [frameSize, imageMetrics]);

  const clampPanForZoom = React.useCallback((
    nextPan: { x: number; y: number },
    nextZoom: number
  ) => {
    if (!loadedSize || frameSize <= 0) return nextPan;
    const baseScale = Math.max(frameSize / loadedSize.width, frameSize / loadedSize.height);
    const width = loadedSize.width * baseScale * nextZoom;
    const height = loadedSize.height * baseScale * nextZoom;
    return {
      x: clamp(nextPan.x, -Math.max((width - frameSize) / 2, 0), Math.max((width - frameSize) / 2, 0)),
      y: clamp(nextPan.y, -Math.max((height - frameSize) / 2, 0), Math.max((height - frameSize) / 2, 0)),
    };
  }, [frameSize, loadedSize]);

  const panResponder = React.useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      const touches = event.nativeEvent.touches;
      gestureRef.current = {
        pan,
        zoom,
        distance: distanceBetweenTouches(touches),
      };
    },
    onPanResponderMove: (event, gestureState) => {
      const touches = event.nativeEvent.touches;
      if (touches.length >= 2) {
        const ratio = distanceBetweenTouches(touches) / gestureRef.current.distance;
        const nextZoom = clamp(gestureRef.current.zoom * ratio, MIN_ZOOM, MAX_ZOOM);
        setZoom(nextZoom);
        setPan(clampPanForZoom(gestureRef.current.pan, nextZoom));
        return;
      }

      const nextPan = {
        x: gestureRef.current.pan.x + gestureState.dx,
        y: gestureRef.current.pan.y + gestureState.dy,
      };
      setPan(clampPanForZoom(nextPan, zoom));
    },
  }), [clampPanForZoom, pan, zoom]);

  function handleFrameLayout(event: LayoutChangeEvent) {
    const width = event.nativeEvent.layout.width;
    const height = event.nativeEvent.layout.height;
    setFrameSize(Math.floor(Math.min(width, height)));
  }

  function setZoomSafely(nextZoom: number) {
    const safeZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    setZoom(safeZoom);
    setPan((current) => clampPanForZoom(current, safeZoom));
  }

  function resetCrop() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function confirmCrop() {
    if (!cropIsValid(currentCrop)) {
      onError?.("cropInvalid", undefined, {
        sourceMimeType: source?.mimeType ?? null,
      });
      return;
    }

    try {
      onDone(currentCrop);
    } catch (error) {
      onError?.("cropConfirmFailed", error, {
        sourceMimeType: source?.mimeType ?? null,
        cropRatio: currentCrop.width / currentCrop.height,
      });
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={[
        styles.modal,
        {
          paddingTop: Math.max(insets.top, 12),
          paddingBottom: Math.max(insets.bottom, 14),
        },
      ]}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.help}>{helpText}</Text>
        </View>

        <View style={styles.stage}>
          <View style={styles.frameOuter} onLayout={handleFrameLayout}>
            {source?.uri && imageMetrics && frameSize > 0 ? (
              <View
                style={[styles.cropFrame, { width: frameSize, height: frameSize }]}
                {...panResponder.panHandlers}
              >
                <Image
                  source={{ uri: source.uri }}
                  style={[
                    styles.cropImage,
                    {
                      width: imageMetrics.width,
                      height: imageMetrics.height,
                      left: imageMetrics.left,
                      top: imageMetrics.top,
                    },
                  ]}
                  resizeMode="stretch"
                  onError={(error) => {
                    onError?.("cropOpenFailed", error.nativeEvent, {
                      sourceMimeType: source.mimeType ?? null,
                    });
                  }}
                />
                <View pointerEvents="none" style={styles.cropFrameBorder} />
              </View>
            ) : (
              <View style={styles.loadingFrame}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            )}
          </View>

          <View style={styles.zoomControls}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setZoomSafely(zoom - 0.2)}
              style={styles.zoomButton}
            >
              <Text style={styles.zoomButtonText}>-</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={resetCrop}
              style={styles.resetButton}
            >
              <Text style={styles.resetText}>{resetLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setZoomSafely(zoom + 0.2)}
              style={styles.zoomButton}
            >
              <Text style={styles.zoomButtonText}>+</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={onCancel} style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>{cancelLabel}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onChooseAnother}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryText}>{chooseAnotherLabel}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={confirmCrop} style={styles.primaryButton}>
            <Text style={styles.primaryText}>{doneLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function CroppedMediaPreview({
  uri,
  crop,
  style,
  borderRadius = 0,
  onError,
}: CroppedPreviewProps) {
  const [frameSize, setFrameSize] = React.useState(0);

  function handleLayout(event: LayoutChangeEvent) {
    const width = event.nativeEvent.layout.width;
    const height = event.nativeEvent.layout.height;
    setFrameSize(Math.floor(Math.min(width, height)));
  }

  const imageStyle = React.useMemo(() => {
    if (!crop || frameSize <= 0) {
      return StyleSheet.absoluteFillObject;
    }

    const width = frameSize / crop.width;
    const height = frameSize / crop.height;
    return {
      position: "absolute" as const,
      width,
      height,
      left: -crop.x * width,
      top: -crop.y * height,
    };
  }, [crop, frameSize]);

  return (
    <View
      style={[styles.previewFrame, { borderRadius }, style]}
      onLayout={handleLayout}
    >
      <Image
        source={{ uri }}
        style={imageStyle}
        resizeMode={crop ? "stretch" : "cover"}
        onError={onError}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  modal: {
    flex: 1,
    backgroundColor: "#080C18",
    paddingHorizontal: 16,
    gap: 14,
  },
  header: {
    gap: 6,
  },
  title: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "900",
  },
  help: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  stage: {
    flex: 1,
    minHeight: 260,
    justifyContent: "center",
    gap: 12,
  },
  frameOuter: {
    width: "100%",
    aspectRatio: 1,
    maxHeight: "82%",
    alignItems: "center",
    justifyContent: "center",
  },
  cropFrame: {
    overflow: "hidden",
    backgroundColor: "#050814",
  },
  cropFrameBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: theme.colors.accent,
  },
  cropImage: {
    position: "absolute",
  },
  loadingFrame: {
    width: "100%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  zoomControls: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  zoomButton: {
    width: 44,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  zoomButtonText: {
    color: theme.colors.text,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "900",
  },
  resetButton: {
    minHeight: 40,
    borderRadius: 8,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  resetText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  secondaryText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  previewFrame: {
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
});
