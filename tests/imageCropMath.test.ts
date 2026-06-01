import {
  CROP_COMFORT_ZOOM_MULTIPLIER,
  clampCropScale,
  clampCropTransform,
  createCenteredCropTransform,
  getCropRectFromTransform,
  getFocalPointZoomTransform,
  getMinZoomToCoverSquare,
  getSourceImageDisplaySize,
  type CropPoint,
  type CropSize,
  type CropTransform,
} from "../src/components/media/imageCropMath";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertClose(actual: number, expected: number, message: string) {
  assert(Math.abs(actual - expected) < 0.000001, `${message}: ${actual} !== ${expected}`);
}

function screenPointForImagePoint(
  imagePoint: CropPoint,
  transform: CropTransform
): CropPoint {
  return {
    x: imagePoint.x * transform.scale + transform.offsetX,
    y: imagePoint.y * transform.scale + transform.offsetY,
  };
}

function imagePointAtScreenPoint(
  screenPoint: CropPoint,
  transform: CropTransform
): CropPoint {
  return {
    x: (screenPoint.x - transform.offsetX) / transform.scale,
    y: (screenPoint.y - transform.offsetY) / transform.scale,
  };
}

function getMaxOffsets(sourceSize: CropSize, cropSize: number, scale: number) {
  const displaySize = getSourceImageDisplaySize(sourceSize, scale);
  return {
    x: Math.max((displaySize.width - cropSize) / 2, 0),
    y: Math.max((displaySize.height - cropSize) / 2, 0),
  };
}

function assertInitialComfortTransformAllowsSmallXYMovement(
  sourceSize: CropSize,
  label: string
) {
  const cropSize = 300;
  const minScale = getMinZoomToCoverSquare(sourceSize, cropSize);
  const centered = createCenteredCropTransform(sourceSize, cropSize);
  const maxOffsets = getMaxOffsets(sourceSize, cropSize, centered.scale);
  const smallOffset = 6;
  const moved = clampCropTransform(
    { ...centered, offsetX: smallOffset, offsetY: -smallOffset },
    sourceSize,
    cropSize
  );

  assertClose(
    centered.scale,
    minScale * CROP_COMFORT_ZOOM_MULTIPLIER,
    `${label} starts at comfort zoom`
  );
  assert(maxOffsets.x >= smallOffset, `${label} has initial horizontal movement room`);
  assert(maxOffsets.y >= smallOffset, `${label} has initial vertical movement room`);
  assertClose(moved.offsetX, smallOffset, `${label} preserves small x drag`);
  assertClose(moved.offsetY, -smallOffset, `${label} preserves small y drag`);
}

function testInitialPortraitTransformAllowsSmallXYMovement() {
  assertInitialComfortTransformAllowsSmallXYMovement(
    { width: 400, height: 800 },
    "portrait transform"
  );
}

function testInitialLandscapeTransformAllowsSmallXYMovement() {
  assertInitialComfortTransformAllowsSmallXYMovement(
    { width: 800, height: 400 },
    "landscape transform"
  );
}

function testClampPreventsBlankCropArea() {
  const sourceSize = { width: 800, height: 400 };
  const cropSize = 300;
  const scale = 1;
  const clamped = clampCropTransform(
    { scale, offsetX: 999, offsetY: 999 },
    sourceSize,
    cropSize
  );
  const maxOffsets = getMaxOffsets(sourceSize, cropSize, clamped.scale);
  const crop = getCropRectFromTransform(sourceSize, cropSize, clamped);

  assertClose(clamped.offsetX, maxOffsets.x, "x pan clamps to the horizontal image edge");
  assertClose(clamped.offsetY, maxOffsets.y, "y pan clamps to the vertical image edge");
  assert(crop.x >= 0, "clamped crop keeps x inside the source image");
  assert(crop.y >= 0, "clamped crop keeps y inside the source image");
  assert(crop.x + crop.width <= 1.000001, "clamped crop width has no blank area");
  assert(crop.y + crop.height <= 1.000001, "clamped crop height has no blank area");
}

function testClampRaisesScaleToCoverCropArea() {
  const sourceSize = { width: 800, height: 400 };
  const cropSize = 300;
  const clamped = clampCropTransform(
    { scale: 0.1, offsetX: Number.NaN, offsetY: Number.POSITIVE_INFINITY },
    sourceSize,
    cropSize
  );

  assertClose(clamped.scale, 0.75, "scale clamps to the minimum square-covering zoom");
  assertClose(clamped.offsetX, 0, "invalid x offset resets safely");
  assertClose(clamped.offsetY, 0, "invalid y offset resets safely");
}

function testCropRectStaysInsideUnitBounds() {
  const sourceSize = { width: 1200, height: 800 };
  const cropSize = 300;
  const crop = getCropRectFromTransform(sourceSize, cropSize, {
    scale: clampCropScale(sourceSize, cropSize, 0.6, 4),
    offsetX: -1000,
    offsetY: 1000,
  });

  assert(crop.x >= 0, "crop x stays inside source bounds");
  assert(crop.y >= 0, "crop y stays inside source bounds");
  assert(crop.x + crop.width <= 1.000001, "crop width stays inside source bounds");
  assert(crop.y + crop.height <= 1.000001, "crop height stays inside source bounds");
  assertClose(
    crop.width * sourceSize.width,
    crop.height * sourceSize.height,
    "normalized crop maps to a square source-pixel crop"
  );
}

function testFocalPointZoomKeepsSelectedImagePointStable() {
  const sourceSize = { width: 600, height: 600 };
  const cropSize = 300;
  const startTransform: CropTransform = {
    scale: 1,
    offsetX: 20,
    offsetY: -10,
  };
  const startFocalPoint = { x: 40, y: -30 };
  const nextFocalPoint = { x: 55, y: -15 };
  const selectedImagePoint = imagePointAtScreenPoint(startFocalPoint, startTransform);
  const nextTransform = getFocalPointZoomTransform({
    sourceSize,
    cropSize,
    transform: startTransform,
    startFocalPoint,
    focalPoint: nextFocalPoint,
    nextScale: 1.4,
  });
  const nextScreenPoint = screenPointForImagePoint(selectedImagePoint, nextTransform);

  assertClose(nextScreenPoint.x, nextFocalPoint.x, "focal zoom keeps x stable");
  assertClose(nextScreenPoint.y, nextFocalPoint.y, "focal zoom keeps y stable");
}

testInitialPortraitTransformAllowsSmallXYMovement();
testInitialLandscapeTransformAllowsSmallXYMovement();
testClampPreventsBlankCropArea();
testClampRaisesScaleToCoverCropArea();
testCropRectStaysInsideUnitBounds();
testFocalPointZoomKeepsSelectedImagePointStable();
