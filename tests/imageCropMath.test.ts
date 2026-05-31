import {
  clampCropScale,
  clampCropTransform,
  createCenteredCropTransform,
  getCropRectFromTransform,
  getFocalPointZoomTransform,
  type CropPoint,
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

function testClampPreventsBlankCropArea() {
  const sourceSize = { width: 800, height: 400 };
  const cropSize = 200;
  const centered = createCenteredCropTransform(sourceSize, cropSize);
  const clamped = clampCropTransform(
    { ...centered, offsetX: 999, offsetY: 999 },
    sourceSize,
    cropSize
  );

  assertClose(clamped.offsetX, 100, "x pan clamps to the horizontal image edge");
  assertClose(clamped.offsetY, 0, "y pan clamps when image height exactly covers crop");
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

testClampPreventsBlankCropArea();
testClampRaisesScaleToCoverCropArea();
testCropRectStaysInsideUnitBounds();
testFocalPointZoomKeepsSelectedImagePointStable();
