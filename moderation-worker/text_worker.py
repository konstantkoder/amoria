"""Bounded stdin/stdout worker for local Amoria text-safety inference.

The worker has no network listener. It accepts only a request ID, message ID, and bounded text;
there is no URL fetch, path input, or command execution. Message text is never logged.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import pathlib
import platform
import sys
import time
from typing import Any

import numpy as np
import onnxruntime as ort
import sentencepiece as spm

MODEL_SHA256 = "783cfd05a5986af42c70923789b206afd5a9c9f3cc1220fabd1e4d8cb183e875"
TOKENIZER_SHA256 = "cfc8146abe2a0488e9e2a0c56de7952f7c11ab059eca145a0a727afce0db2865"
MODEL_VERSION = "unitary/multilingual-toxic-xlm-roberta@4ad6f5c+hoan-onnx@87059f2"
MAX_LINE_BYTES = 32 * 1024
MAX_TEXT_CHARS = 4_000
MAX_TOKENS = 256


def peak_rss_bytes() -> int:
    """Return this worker's peak resident set without adding a runtime dependency."""
    if platform.system() == "Windows":
        import ctypes
        from ctypes import wintypes

        class ProcessMemoryCounters(ctypes.Structure):
            _fields_ = [
                ("cb", wintypes.DWORD),
                ("PageFaultCount", wintypes.DWORD),
                ("PeakWorkingSetSize", ctypes.c_size_t),
                ("WorkingSetSize", ctypes.c_size_t),
                ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                ("PagefileUsage", ctypes.c_size_t),
                ("PeakPagefileUsage", ctypes.c_size_t),
            ]

        counters = ProcessMemoryCounters()
        counters.cb = ctypes.sizeof(counters)
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        psapi = ctypes.WinDLL("psapi", use_last_error=True)
        kernel32.GetCurrentProcess.restype = wintypes.HANDLE
        psapi.GetProcessMemoryInfo.argtypes = [
            wintypes.HANDLE,
            ctypes.POINTER(ProcessMemoryCounters),
            wintypes.DWORD,
        ]
        psapi.GetProcessMemoryInfo.restype = wintypes.BOOL
        process = kernel32.GetCurrentProcess()
        if psapi.GetProcessMemoryInfo(
            process, ctypes.byref(counters), counters.cb
        ):
            return int(counters.PeakWorkingSetSize)
        return 0

    import resource

    value = int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
    return value if platform.system() == "Darwin" else value * 1024


def checksum(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


class Classifier:
    def __init__(self, model_dir: pathlib.Path) -> None:
        model_path = model_dir / "model_quantized.onnx"
        tokenizer_path = model_dir / "sentencepiece.bpe.model"
        if not model_path.is_file() or not tokenizer_path.is_file():
            raise RuntimeError("text_model_files_missing")
        if checksum(model_path) != MODEL_SHA256:
            raise RuntimeError("text_model_checksum_mismatch")
        if checksum(tokenizer_path) != TOKENIZER_SHA256:
            raise RuntimeError("text_tokenizer_checksum_mismatch")

        options = ort.SessionOptions()
        options.intra_op_num_threads = max(1, min(2, os.cpu_count() or 1))
        options.inter_op_num_threads = 1
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        self.session = ort.InferenceSession(
            str(model_path),
            sess_options=options,
            providers=["CPUExecutionProvider"],
        )
        self.tokenizer = spm.SentencePieceProcessor(model_file=str(tokenizer_path))
        self.input_names = {entry.name for entry in self.session.get_inputs()}
        if "input_ids" not in self.input_names or "attention_mask" not in self.input_names:
            raise RuntimeError("text_model_input_contract_mismatch")
        self.model_size_bytes = model_path.stat().st_size + tokenizer_path.stat().st_size

    def classify(self, text: str) -> dict[str, Any]:
        started = time.perf_counter()
        piece_ids = self.tokenizer.encode(text, out_type=int)[: MAX_TOKENS - 2]
        token_ids = [0, *[(3 if item == 0 else item + 1) for item in piece_ids], 2]
        input_ids = np.asarray([token_ids], dtype=np.int64)
        attention_mask = np.ones_like(input_ids, dtype=np.int64)
        feed = {"input_ids": input_ids, "attention_mask": attention_mask}
        if "token_type_ids" in self.input_names:
            feed["token_type_ids"] = np.zeros_like(input_ids, dtype=np.int64)
        logits = np.asarray(self.session.run(None, feed)[0], dtype=np.float64)[0]
        scores = [1.0 / (1.0 + math.exp(-float(value))) for value in logits]
        if len(scores) < 6:
            raise RuntimeError("text_model_output_contract_mismatch")
        return {
            "signals": {
                "toxicity": scores[0],
                "severeToxicity": scores[1],
                "identityAttack": scores[3],
                "insult": scores[4],
                "threat": scores[5],
            },
            "durationMs": round((time.perf_counter() - started) * 1000, 3),
        }


def emit(value: dict[str, Any]) -> None:
    print(json.dumps(value, ensure_ascii=False, separators=(",", ":")), flush=True)


def main() -> int:
    model_dir_value = os.getenv("TEXT_MODERATION_MODEL_DIR", "").strip()
    if not model_dir_value:
        raise RuntimeError("TEXT_MODERATION_MODEL_DIR is required")
    started = time.perf_counter()
    classifier = Classifier(pathlib.Path(model_dir_value))
    emit({
        "event": "ready",
        "modelVersion": MODEL_VERSION,
        "modelSizeBytes": classifier.model_size_bytes,
        "loadMs": round((time.perf_counter() - started) * 1000, 3),
        "peakRssBytes": peak_rss_bytes(),
    })

    for raw_line in sys.stdin.buffer:
        if len(raw_line) > MAX_LINE_BYTES:
            emit({"requestId": "", "ok": False, "error": "request_too_large"})
            continue
        request_id = ""
        message_id = ""
        try:
            payload = json.loads(raw_line.decode("utf-8"))
            request_id = str(payload.get("requestId", ""))
            message_id = str(payload.get("messageId", ""))
            text = payload.get("text")
            if not request_id or not message_id or not isinstance(text, str):
                raise ValueError("invalid_request")
            if not text or len(text) > MAX_TEXT_CHARS:
                raise ValueError("invalid_text_length")
            result = classifier.classify(text)
            emit({
                "requestId": request_id,
                "messageId": message_id,
                "ok": True,
                "peakRssBytes": peak_rss_bytes(),
                **result,
            })
        except ValueError as error:
            emit({"requestId": request_id, "messageId": message_id, "ok": False, "error": str(error)})
        except Exception:
            emit({"requestId": request_id, "messageId": message_id, "ok": False, "error": "classifier_failed"})
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"event": "startup_failed", "error": str(error)}), file=sys.stderr, flush=True)
        raise SystemExit(1)
