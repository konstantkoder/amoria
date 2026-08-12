# Model and runtime notices

- Yahoo OpenNSFW model and source: BSD-2-Clause, <https://github.com/yahoo/open_nsfw/blob/master/LICENSE.md>
- `opennsfw-onnx` package: Apache-2.0, <https://github.com/gawryco/opennsfw-onnx/blob/v0.1.0/LICENSE>
- ONNX Runtime: MIT, <https://github.com/microsoft/onnxruntime/blob/main/LICENSE>
- Unitary Detoxify multilingual XLM-R model: Apache-2.0,
  <https://huggingface.co/unitary/multilingual-toxic-xlm-roberta/tree/4ad6f5c104d9ce813a1a2f33cac0c5b579ef6ee5>
- Pinned dynamic-quantized ONNX conversion of that checkpoint: Apache-2.0,
  <https://huggingface.co/hoan/multilingual-toxic-xlm-roberta-dynamic-quantized/tree/87059f2f26f113930e3c840b4bf7d5de0a4a1944>
- SentencePiece: Apache-2.0, <https://github.com/google/sentencepiece/blob/master/LICENSE>
- YOLOX-Nano code and official ONNX release asset: Apache-2.0,
  <https://github.com/Megvii-BaseDetection/YOLOX/blob/e1052df71842031413f6030723c3607b839c80ce/LICENSE>
- YuNet face detector model directory: MIT,
  <https://github.com/opencv/opencv_zoo/tree/f12e12798e8314f7c074a6656816c048dcc95b7a/models/face_detection_yunet>
- Owen Elliott Image Safety Classifier S model and weights: MIT,
  <https://huggingface.co/OwenElliott/image-safety-classifier-s/tree/015042b0eab17f1b17f2986527386346fb0d94be>

These links identify the upstream license texts. Model weights are installed into the configured
external cache and are not redistributed in this repository. The person-presence combination uses
only object/face presence confidence. It does not create face embeddings or perform identity
matching. The image-safety classifier emits only image-level NSFL, NSFW, and SFW probabilities;
no image content or derived features are retained.
