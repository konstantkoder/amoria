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

import {
  clampCropScale,
  clampCropTransform,
  createCenteredCropTransform,
  getCropRectFromTransform,
  getFocalPointZoomTransform,
  getSourceImageDisplaySize,
  isValidNormalizedCrop,
  type CropPoint,
  type CropSize,
  type CropTransform,
  type NormalizedMediaCrop,
} from "./imageCropMath";

export type { NormalizedMediaCrop } from "./imageCropMath";

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

type StageGeometry = {
  width: number;
  height: number;
  cropSize: number;
  cropLeft: number;
  cropTop: number;
  cropCenterX: number;
  cropCenterY: number;
};

type NativeTouch = {
  pageX: number;
  pageY: number;
  locationX?: number;
  locationY?: number;
};

type ActiveGesture =
  | { mode: "none" }
  | { mode: "pan"; lastPanPoint: CropPoint }
  | {
      mode: "pinch";
      transform: CropTransform;
      distance: number;
      startFocalPoint: CropPoint;
    };

const MAX_ZOOM_MULTIPLIER = 4;
const CROP_STAGE_INSET = 28;
const CROP_STAGE_MAX_SIZE = 340;
const EMPTY_GESTURE: ActiveGesture = { mode: "none" };

function distanceBetweenTouches(touches: readonly NativeTouch[]) {
  if (touches.length < 2 || !touches[0] || !touches[1]) return 1;
  return Math.max(
    Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY),
    1
  );
}

function touchLocation(touch: NativeTouch) {
  return {
    x: typeof touch.locationX === "number" ? touch.locationX : 0,
    y: typeof touch.locationY === "number" ? touch.locationY : 0,
  };
}

function focalPointFromTouches(
  touches: readonly NativeTouch[],
  geometry: StageGeometry
): CropPoint {
  const first = touches[0];
  const second = touches[1];
  if (!first) return { x: 0, y: 0 };
  const firstLocation = touchLocation(first);
  const midpoint = second
    ? {
        x: (firstLocation.x + touchLocation(second).x) / 2,
        y: (firstLocation.y + touchLocation(second).y) / 2,
      }
    : firstLocation;

  return {
    x: midpoint.x - geometry.cropCenterX,
    y: midpoint.y - geometry.cropCenterY,
  };
}

function stageGeometryFromSize(stageSize: CropSize): StageGeometry | null {
  const width = Math.floor(stageSize.width);
  const height = Math.floor(stageSize.height);
  const cropSize = Math.floor(
    Math.min(
      width - CROP_STAGE_INSET * 2,
      height - CROP_STAGE_INSET * 2,
      CROP_STAGE_MAX_SIZE
    )
  );

  if (width <= 0 || height <= 0 || cropSize <= 0) {
    return null;
  }

  return {
    width,
    height,
    cropSize,
    cropLeft: (width - cropSize) / 2,
    cropTop: (height - cropSize) / 2,
    cropCenterX: width / 2,
    cropCenterY: height / 2,
  };
}

export default function ImageCropper({
  visible,
  source,
  title,
  helpText,
  doneLabel,
  cancelLabel,
  chooseAnotherLabel,
  onDone,
  onCancel,
  onChooseAnother,
  onError,
}: ImageCropperProps) {
  const insets = useSafeAreaInsets();
  const [stageSize, setStageSize] = React.useState<CropSize>({ width: 0, height: 0 });
  const [loadedSize, setLoadedSize] = React.useState<CropSize | null>(null);
  const [transform, setTransform] = React.useState<CropTransform | null>(null);
  const transformRef = React.useRef<CropTransform | null>(null);
  const gestureRef = React.useRef<ActiveGesture>(EMPTY_GESTURE);

  const setCropTransform = React.useCallback((nextTransform: CropTransform | null) => {
    transformRef.current = nextTransform;
    setTransform(nextTransform);
  }, []);

  const stageGeometry = React.useMemo(
    () => stageGeometryFromSize(stageSize),
    [stageSize.height, stageSize.width]
  );

  React.useEffect(() => {
    if (!visible) {
      setCropTransform(null);
      gestureRef.current = EMPTY_GESTURE;
      return;
    }

    setCropTransform(null);
    gestureRef.current = EMPTY_GESTURE;
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
  }, [
    onError,
    setCropTransform,
    source?.height,
    source?.mimeType,
    source?.uri,
    source?.width,
    visible,
  ]);

  React.useEffect(() => {
    if (!visible || !loadedSize || !stageGeometry) return;
    setCropTransform(createCenteredCropTransform(loadedSize, stageGeometry.cropSize));
  }, [
    loadedSize,
    setCropTransform,
    source?.uri,
    stageGeometry?.cropSize,
    visible,
  ]);

  const clampedTransform = React.useMemo(() => {
    if (!loadedSize || !stageGeometry || !transform) return null;
    return clampCropTransform(transform, loadedSize, stageGeometry.cropSize);
  }, [loadedSize, stageGeometry, transform]);

  React.useEffect(() => {
    if (!clampedTransform || !transform) return;
    if (
      clampedTransform.scale === transform.scale &&
      clampedTransform.offsetX === transform.offsetX &&
      clampedTransform.offsetY === transform.offsetY
    ) {
      return;
    }
    setCropTransform(clampedTransform);
  }, [clampedTransform, setCropTransform, transform]);

  const imageMetrics = React.useMemo(() => {
    if (!loadedSize || !stageGeometry || !clampedTransform) return null;
    const displaySize = getSourceImageDisplaySize(loadedSize, clampedTransform.scale);
    return {
      width: displaySize.width,
      height: displaySize.height,
      left: stageGeometry.cropCenterX + clampedTransform.offsetX - displaySize.width / 2,
      top: stageGeometry.cropCenterY + clampedTransform.offsetY - displaySize.height / 2,
    };
  }, [clampedTransform, loadedSize, stageGeometry]);

  const currentCrop = React.useMemo<NormalizedMediaCrop | null>(() => {
    if (!loadedSize || !stageGeometry || !clampedTransform) return null;
    return getCropRectFromTransform(loadedSize, stageGeometry.cropSize, clampedTransform);
  }, [clampedTransform, loadedSize, stageGeometry]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const touches = event.nativeEvent.touches as NativeTouch[];
          const currentTransform = transformRef.current;
          if (!currentTransform || !stageGeometry) return;

          if (touches.length >= 2) {
            gestureRef.current = {
              mode: "pinch",
              transform: currentTransform,
              distance: distanceBetweenTouches(touches),
              startFocalPoint: focalPointFromTouches(touches, stageGeometry),
            };
            return;
          }

          const touch = touches[0];
          gestureRef.current = touch
            ? { mode: "pan", lastPanPoint: { x: touch.pageX, y: touch.pageY } }
            : EMPTY_GESTURE;
        },
        onPanResponderMove: (event) => {
          const touches = event.nativeEvent.touches as NativeTouch[];
          const currentTransform = transformRef.current;
          if (!currentTransform || !loadedSize || !stageGeometry) return;

          if (touches.length >= 2) {
            if (gestureRef.current.mode !== "pinch") {
              gestureRef.current = {
                mode: "pinch",
                transform: currentTransform,
                distance: distanceBetweenTouches(touches),
                startFocalPoint: focalPointFromTouches(touches, stageGeometry),
              };
            }

            const gesture = gestureRef.current;
            if (gesture.mode !== "pinch") return;
            const nextScale = clampCropScale(
              loadedSize,
              stageGeometry.cropSize,
              gesture.transform.scale * (distanceBetweenTouches(touches) / gesture.distance),
              MAX_ZOOM_MULTIPLIER
            );
            setCropTransform(
              getFocalPointZoomTransform({
                sourceSize: loadedSize,
                cropSize: stageGeometry.cropSize,
                transform: gesture.transform,
                startFocalPoint: gesture.startFocalPoint,
                focalPoint: focalPointFromTouches(touches, stageGeometry),
                nextScale,
              })
            );
            return;
          }

          const touch = touches[0];
          if (!touch) return;
          if (gestureRef.current.mode !== "pan") {
            gestureRef.current = {
              mode: "pan",
              lastPanPoint: { x: touch.pageX, y: touch.pageY },
            };
            return;
          }

          const deltaX = touch.pageX - gestureRef.current.lastPanPoint.x;
          const deltaY = touch.pageY - gestureRef.current.lastPanPoint.y;
          const nextTransform = clampCropTransform(
            {
              ...currentTransform,
              offsetX: currentTransform.offsetX + deltaX,
              offsetY: currentTransform.offsetY + deltaY,
            },
            loadedSize,
            stageGeometry.cropSize
          );

          gestureRef.current = {
            mode: "pan",
            lastPanPoint: { x: touch.pageX, y: touch.pageY },
          };
          setCropTransform(nextTransform);
        },
        onPanResponderRelease: () => {
          gestureRef.current = EMPTY_GESTURE;
        },
        onPanResponderTerminate: () => {
          gestureRef.current = EMPTY_GESTURE;
        },
      }),
    [loadedSize, setCropTransform, stageGeometry]
  );

  function handleStageLayout(event: LayoutChangeEvent) {
    const nextSize = {
      width: Math.floor(event.nativeEvent.layout.width),
      height: Math.floor(event.nativeEvent.layout.height),
    };
    setStageSize((currentSize) =>
      currentSize.width === nextSize.width && currentSize.height === nextSize.height
        ? currentSize
        : nextSize
    );
  }

  function confirmCrop() {
    if (!isValidNormalizedCrop(currentCrop)) {
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

  const cropReady = Boolean(source?.uri && imageMetrics && stageGeometry);
  const canConfirmCrop = isValidNormalizedCrop(currentCrop);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View
        style={[
          styles.modal,
          {
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.help}>{helpText}</Text>
        </View>

        <View style={styles.stage} onLayout={handleStageLayout}>
          {cropReady && imageMetrics && stageGeometry ? (
            <View style={styles.stageCanvas}>
              <Image
                source={{ uri: source?.uri ?? "" }}
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
                    sourceMimeType: source?.mimeType ?? null,
                  });
                }}
              />
              <View style={styles.gestureLayer} {...panResponder.panHandlers} />
              <View pointerEvents="none" style={styles.overlayLayer}>
                <View
                  style={[
                    styles.dimOverlay,
                    {
                      left: 0,
                      top: 0,
                      width: stageGeometry.width,
                      height: stageGeometry.cropTop,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.dimOverlay,
                    {
                      left: 0,
                      top: stageGeometry.cropTop,
                      width: stageGeometry.cropLeft,
                      height: stageGeometry.cropSize,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.dimOverlay,
                    {
                      left: stageGeometry.cropLeft + stageGeometry.cropSize,
                      top: stageGeometry.cropTop,
                      width:
                        stageGeometry.width - stageGeometry.cropLeft - stageGeometry.cropSize,
                      height: stageGeometry.cropSize,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.dimOverlay,
                    {
                      left: 0,
                      top: stageGeometry.cropTop + stageGeometry.cropSize,
                      width: stageGeometry.width,
                      height:
                        stageGeometry.height - stageGeometry.cropTop - stageGeometry.cropSize,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.cropFrameOverlay,
                    {
                      left: stageGeometry.cropLeft,
                      top: stageGeometry.cropTop,
                      width: stageGeometry.cropSize,
                      height: stageGeometry.cropSize,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.gridLineVertical,
                      { left: stageGeometry.cropSize / 3 },
                    ]}
                  />
                  <View
                    style={[
                      styles.gridLineVertical,
                      { left: (stageGeometry.cropSize / 3) * 2 },
                    ]}
                  />
                  <View
                    style={[
                      styles.gridLineHorizontal,
                      { top: stageGeometry.cropSize / 3 },
                    ]}
                  />
                  <View
                    style={[
                      styles.gridLineHorizontal,
                      { top: (stageGeometry.cropSize / 3) * 2 },
                    ]}
                  />
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.loadingFrame}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          )}
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canConfirmCrop }}
            disabled={!canConfirmCrop}
            onPress={confirmCrop}
            style={[
              styles.primaryButton,
              !canConfirmCrop ? styles.primaryButtonDisabled : null,
            ]}
          >
            <Text
              numberOfLines={2}
              style={[
                styles.primaryText,
                !canConfirmCrop ? styles.primaryTextDisabled : null,
              ]}
            >
              {doneLabel}
            </Text>
          </Pressable>
          <View style={styles.secondaryActions}>
            <Pressable accessibilityRole="button" onPress={onCancel} style={styles.secondaryButton}>
              <Text numberOfLines={2} style={styles.secondaryText}>
                {cancelLabel}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onChooseAnother}
              style={styles.secondaryButton}
            >
              <Text numberOfLines={2} style={styles.secondaryText}>
                {chooseAnotherLabel}
              </Text>
            </Pressable>
          </View>
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
    backgroundColor: "#03050B",
  },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 10,
    gap: 6,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
  },
  help: {
    color: "rgba(255,255,255,0.74)",
    fontSize: 13,
    lineHeight: 18,
  },
  stage: {
    flex: 1,
    minHeight: 220,
    overflow: "hidden",
    backgroundColor: "#03050B",
  },
  stageCanvas: {
    ...StyleSheet.absoluteFillObject,
  },
  cropImage: {
    position: "absolute",
  },
  gestureLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  overlayLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
  },
  dimOverlay: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  cropFrameOverlay: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    overflow: "hidden",
  },
  gridLineVertical: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(255,255,255,0.58)",
  },
  gridLineHorizontal: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.58)",
  },
  loadingFrame: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#03050B",
  },
  actions: {
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 18,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primaryActionBg,
    borderWidth: 1,
    borderColor: theme.colors.primaryActionBorder,
  },
  primaryButtonDisabled: {
    backgroundColor: "rgba(201,120,104,0.12)",
    borderColor: "rgba(201,120,104,0.28)",
  },
  primaryText: {
    color: theme.colors.primaryActionText,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "900",
    textAlign: "center",
  },
  primaryTextDisabled: {
    color: "rgba(221,160,139,0.58)",
  },
  secondaryActions: {
    flexDirection: "row",
    gap: 9,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 17,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.buttons.secondary.backgroundColor,
    borderWidth: 1,
    borderColor: theme.buttons.secondary.borderColor,
  },
  secondaryText: {
    color: theme.buttons.secondary.textColor,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
    textAlign: "center",
  },
  previewFrame: {
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
});
