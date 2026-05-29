export type NormalizedMediaCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CropPoint = {
  x: number;
  y: number;
};

export type CropSize = {
  width: number;
  height: number;
};

export type CropTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

export type CropDisplaySize = {
  width: number;
  height: number;
};

export function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function getMinZoomToCoverSquare(sourceSize: CropSize, cropSize: number) {
  if (
    cropSize <= 0 ||
    sourceSize.width <= 0 ||
    sourceSize.height <= 0
  ) {
    return 1;
  }

  return Math.max(cropSize / sourceSize.width, cropSize / sourceSize.height);
}

export function clampCropScale(
  sourceSize: CropSize,
  cropSize: number,
  scale: number,
  maxZoomMultiplier: number
) {
  const minScale = getMinZoomToCoverSquare(sourceSize, cropSize);
  return clampNumber(scale, minScale, minScale * maxZoomMultiplier);
}

export function getSourceImageDisplaySize(
  sourceSize: CropSize,
  scale: number
): CropDisplaySize {
  return {
    width: sourceSize.width * scale,
    height: sourceSize.height * scale,
  };
}

export function createCenteredCropTransform(
  sourceSize: CropSize,
  cropSize: number
): CropTransform {
  return {
    scale: getMinZoomToCoverSquare(sourceSize, cropSize),
    offsetX: 0,
    offsetY: 0,
  };
}

export function clampCropTransform(
  transform: CropTransform,
  sourceSize: CropSize,
  cropSize: number
): CropTransform {
  const displaySize = getSourceImageDisplaySize(sourceSize, transform.scale);
  const maxOffsetX = Math.max((displaySize.width - cropSize) / 2, 0);
  const maxOffsetY = Math.max((displaySize.height - cropSize) / 2, 0);

  return {
    scale: transform.scale,
    offsetX: clampNumber(transform.offsetX, -maxOffsetX, maxOffsetX),
    offsetY: clampNumber(transform.offsetY, -maxOffsetY, maxOffsetY),
  };
}

export function getCropRectFromTransform(
  sourceSize: CropSize,
  cropSize: number,
  transform: CropTransform
): NormalizedMediaCrop {
  const clampedTransform = clampCropTransform(transform, sourceSize, cropSize);
  const displaySize = getSourceImageDisplaySize(sourceSize, clampedTransform.scale);
  const width = clampNumber(cropSize / displaySize.width, 0, 1);
  const height = clampNumber(cropSize / displaySize.height, 0, 1);
  const maxX = Math.max(1 - width, 0);
  const maxY = Math.max(1 - height, 0);

  return {
    x: clampNumber(
      ((displaySize.width - cropSize) / 2 - clampedTransform.offsetX) / displaySize.width,
      0,
      maxX
    ),
    y: clampNumber(
      ((displaySize.height - cropSize) / 2 - clampedTransform.offsetY) / displaySize.height,
      0,
      maxY
    ),
    width,
    height,
  };
}

export function getFocalPointZoomTransform({
  sourceSize,
  cropSize,
  transform,
  startFocalPoint,
  focalPoint,
  nextScale,
}: {
  sourceSize: CropSize;
  cropSize: number;
  transform: CropTransform;
  startFocalPoint: CropPoint;
  focalPoint: CropPoint;
  nextScale: number;
}): CropTransform {
  const imagePointX = (startFocalPoint.x - transform.offsetX) / transform.scale;
  const imagePointY = (startFocalPoint.y - transform.offsetY) / transform.scale;

  return clampCropTransform(
    {
      scale: nextScale,
      offsetX: focalPoint.x - imagePointX * nextScale,
      offsetY: focalPoint.y - imagePointY * nextScale,
    },
    sourceSize,
    cropSize
  );
}

export function isValidNormalizedCrop(
  crop: NormalizedMediaCrop | null | undefined
): crop is NormalizedMediaCrop {
  return (
    Boolean(crop) &&
    Number.isFinite(crop?.x) &&
    Number.isFinite(crop?.y) &&
    Number.isFinite(crop?.width) &&
    Number.isFinite(crop?.height) &&
    crop.x >= 0 &&
    crop.y >= 0 &&
    crop.width > 0 &&
    crop.height > 0 &&
    crop.x + crop.width <= 1.000001 &&
    crop.y + crop.height <= 1.000001
  );
}
