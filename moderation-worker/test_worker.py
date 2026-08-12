import inspect
import io
import os
import pathlib
import tempfile
import unittest

import numpy as np
from PIL import Image

from worker import (
    Config,
    GraphicSafetyClassifier,
    InferenceSupervisor,
    ModerationFailure,
    automatically_scannable,
    build_claimed_job,
    decide_media_policy,
    decide_graphic_policy,
    decide_person_presence,
    decide_policy,
    inference_process,
    parse_graphic_probabilities,
    sync_owner_media_references,
    to_raw_result,
)


def config() -> Config:
    return Config(
        database_url="postgresql://unused",
        s3_endpoint="http://unused",
        s3_region="us-east-1",
        s3_access_key="unused",
        s3_secret_key="unused",
        s3_bucket="unused",
        concurrency=1,
        poll_seconds=2,
        max_attempts=3,
        retry_base_seconds=15,
        max_image_bytes=10_485_760,
        max_dimension=4096,
        inference_timeout_seconds=30,
        running_timeout_seconds=180,
        approve_max_nsfw=0.20,
        restrict_min_nsfw=0.95,
        model_path=None,
        person_yolox_model_path=None,
        person_yunet_model_path=None,
        graphic_safety_model_path=None,
        graphic_review_min_nsfl=0.20,
        graphic_restrict_min_nsfl=0.90,
    )


class WorkerPolicyTests(unittest.TestCase):
    def test_policy_boundaries_are_separate_from_model_output(self) -> None:
        cfg = config()
        self.assertEqual(decide_policy(0.20, cfg), "approve")
        self.assertEqual(decide_policy(0.50, cfg), "needs_review")
        self.assertEqual(decide_policy(0.80, cfg), "needs_review")
        self.assertEqual(decide_policy(0.95, cfg), "restrict")

    def test_graphic_policy_has_review_band_before_restriction(self) -> None:
        cfg = config()
        self.assertEqual(decide_graphic_policy(0.19, cfg), "approve")
        self.assertEqual(decide_graphic_policy(0.20, cfg), "needs_review")
        self.assertEqual(decide_graphic_policy(0.89, cfg), "needs_review")
        self.assertEqual(decide_graphic_policy(0.90, cfg), "restrict")

    def test_person_presence_combines_person_and_face_without_identity(self) -> None:
        self.assertEqual(decide_person_presence(0.35, 0.0), "true")
        self.assertEqual(decide_person_presence(0.0, 0.80), "true")
        self.assertEqual(decide_person_presence(0.10, 0.0), "unknown")
        self.assertEqual(decide_person_presence(0.0, 0.60), "unknown")
        self.assertEqual(decide_person_presence(0.09, 0.59), "false")

    def test_missing_person_detector_is_unknown_not_false(self) -> None:
        result = to_raw_result({
            "nsfwProbability": 0.01,
            "sfwProbability": 0.99,
            "inferenceMs": 5.0,
            "personDetectorError": "person_model_not_configured",
            "graphicNsflProbability": 0.01,
            "graphicNsfwProbability": 0.02,
            "graphicSfwProbability": 0.97,
            "graphicInferenceMs": 4.0,
        }, config())
        self.assertEqual(result["containsPerson"], "unknown")
        self.assertEqual(result["personPresence"]["errorCode"], "person_model_not_configured")

    def test_avatar_requires_person_presence_with_nsfw_restriction_priority(self) -> None:
        cfg = config()
        self.assertEqual(decide_media_policy(0.01, 0.01, "true", "avatar", cfg), ("approve", None))
        self.assertEqual(
            decide_media_policy(0.01, 0.01, "false", "avatar", cfg),
            ("needs_review", "person_not_detected"),
        )
        self.assertEqual(
            decide_media_policy(0.01, 0.01, "unknown", "avatar", cfg),
            ("needs_review", "person_presence_uncertain"),
        )
        self.assertEqual(
            decide_media_policy(0.50, 0.01, "true", "avatar", cfg),
            ("needs_review", None),
        )
        self.assertEqual(decide_media_policy(0.95, 0.95, "false", "avatar", cfg), ("restrict", None))

    def test_graphic_signal_gates_avatar_and_public_gallery(self) -> None:
        cfg = config()
        for media_type in ("avatar", "profile_photo"):
            with self.subTest(media_type=media_type, signal="ambiguous"):
                self.assertEqual(
                    decide_media_policy(0.01, 0.20, "true", media_type, cfg),
                    ("needs_review", "graphic_gore_uncertain"),
                )
            with self.subTest(media_type=media_type, signal="strong"):
                self.assertEqual(
                    decide_media_policy(0.01, 0.90, "true", media_type, cfg),
                    ("restrict", "graphic_gore_high_confidence"),
                )

    def test_public_gallery_person_signal_remains_informational(self) -> None:
        cfg = config()
        self.assertEqual(decide_media_policy(0.01, 0.01, "false", "profile_photo", cfg), ("approve", None))
        self.assertEqual(decide_media_policy(0.01, 0.01, "unknown", "profile_photo", cfg), ("approve", None))

    def test_graphic_evidence_is_reviewable_and_contains_no_paths(self) -> None:
        raw = to_raw_result({
            "nsfwProbability": 0.01,
            "sfwProbability": 0.99,
            "inferenceMs": 5.0,
            "containsPerson": "true",
            "personConfidence": 0.8,
            "facePresenceConfidence": 0.9,
            "personInferenceMs": 3.0,
            "personDetectorError": None,
            "graphicNsflProbability": 0.25,
            "graphicNsfwProbability": 0.05,
            "graphicSfwProbability": 0.70,
            "graphicInferenceMs": 4.0,
        }, config())
        self.assertEqual(raw["graphicSafety"]["policyDecision"], "needs_review")
        self.assertEqual(raw["graphicSafety"]["modelVersion"], (
            "OwenElliott/image-safety-classifier-s@015042b0eab17f1b17f2986527386346fb0d94be"
        ))
        self.assertTrue(raw["needsHumanReview"])
        self.assertNotIn("path", str(raw).lower())
        self.assertNotIn("url", str(raw).lower())

    def test_graphic_model_rejects_missing_and_corrupt_weights(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            missing = pathlib.Path(temporary_directory) / "missing.onnx"
            with self.assertRaisesRegex(RuntimeError, "graphic_model_missing"):
                GraphicSafetyClassifier(str(missing))
            corrupt = pathlib.Path(temporary_directory) / "corrupt.onnx"
            corrupt.write_bytes(b"not-an-onnx-model")
            with self.assertRaisesRegex(RuntimeError, "graphic_model_checksum_mismatch"):
                GraphicSafetyClassifier(str(corrupt))

    def test_graphic_model_rejects_malformed_output(self) -> None:
        invalid_outputs = (
            np.array([[0.2, 0.8]], dtype=np.float32),
            np.array([[0.2, np.nan, 0.8]], dtype=np.float32),
            np.array([[0.2, 0.2, 0.2]], dtype=np.float32),
        )
        for output in invalid_outputs:
            with self.subTest(output=output):
                with self.assertRaisesRegex(RuntimeError, "graphic_model_output_invalid"):
                    parse_graphic_probabilities(output)

    def test_graphic_classifier_accepts_only_decoded_job_bytes(self) -> None:
        parameters = tuple(inspect.signature(GraphicSafetyClassifier.classify).parameters)
        self.assertEqual(parameters, ("self", "image_bytes"))

    def test_only_avatar_or_currently_public_profile_photo_is_scannable(self) -> None:
        self.assertTrue(automatically_scannable({"type": "avatar", "moderation_state": "pending"}))
        self.assertTrue(automatically_scannable({"type": "profile_photo", "visibility": "public"}))
        self.assertFalse(automatically_scannable({"type": "profile_photo", "visibility": "locked"}))
        self.assertFalse(automatically_scannable({"type": "message_attachment", "visibility": "public"}))
        self.assertFalse(automatically_scannable({"type": "avatar", "moderation_state": "removed"}))

    def test_claim_keeps_job_id_distinct_from_media_id(self) -> None:
        claim = build_claimed_job(
            {"id": "media-row-id", "path": "trusted/object.webp"},
            {"id": "job-row-id", "media_id": "media-row-id", "attempt_count": 0},
            1,
        )
        self.assertEqual(claim["id"], "job-row-id")
        self.assertEqual(claim["media_id"], "media-row-id")
        self.assertEqual(claim["attempt_count"], 1)

    def test_first_approved_avatar_types_the_null_previous_reference(self) -> None:
        class Cursor:
            def __init__(self) -> None:
                self.queries = []
                self.rowcount = 0

            def execute(self, query, _params) -> None:
                self.queries.append(query)
                self.rowcount = 1 if "UPDATE users u SET avatar_url" in query else 0

            @staticmethod
            def fetchone():
                return {"avatar_url": None}

            @staticmethod
            def fetchall():
                return []

        cursor = Cursor()
        sync_owner_media_references(cursor, {
            "type": "avatar",
            "owner_user_id": "owner-id",
            "media_id": "media-id",
            "url": "/media/public/media-id",
        }, "approve")

        replacement_query = next(query for query in cursor.queries if "UPDATE media_files" in query)
        self.assertIn("%s::text IS NOT NULL", replacement_query)

    def test_inference_timeout_is_a_failure_and_terminates_the_supervisor(self) -> None:
        class LiveProcess:
            @staticmethod
            def is_alive() -> bool:
                return True

        class TimedOutConnection:
            @staticmethod
            def send(_payload: bytes) -> None:
                return None

            @staticmethod
            def poll(_timeout: int) -> bool:
                return False

        supervisor = InferenceSupervisor(config(), 0)
        supervisor.process = LiveProcess()
        supervisor.connection = TimedOutConnection()
        stopped = []
        supervisor.stop = lambda force=False: stopped.append(force)

        with self.assertRaises(ModerationFailure) as raised:
            supervisor.classify(b"sanitized-image-bytes")

        self.assertEqual(raised.exception.code, "inference_timeout")
        self.assertEqual(stopped, [True])

    def test_graphic_inference_failure_is_not_approved(self) -> None:
        class LiveProcess:
            @staticmethod
            def is_alive() -> bool:
                return True

        class FailedConnection:
            @staticmethod
            def send(_payload: bytes) -> None:
                return None

            @staticmethod
            def poll(_timeout: int) -> bool:
                return True

            @staticmethod
            def recv():
                return {"ok": False, "error": "graphic_classifier_failed"}

        supervisor = InferenceSupervisor(config(), 0)
        supervisor.process = LiveProcess()
        supervisor.connection = FailedConnection()

        with self.assertRaises(ModerationFailure) as raised:
            supervisor.classify(b"sanitized-image-bytes")

        self.assertEqual(raised.exception.code, "graphic_classifier_failed")


@unittest.skipUnless(
    all(os.getenv(name) for name in (
        "OPENNSFW_ONNX_MODEL_PATH",
        "PERSON_YOLOX_ONNX_MODEL_PATH",
        "PERSON_YUNET_ONNX_MODEL_PATH",
        "GRAPHIC_SAFETY_ONNX_MODEL_PATH",
    )),
    "pinned local moderation models are not configured",
)
class InstalledModelIntegrationTests(unittest.TestCase):
    def test_all_detectors_load_and_run_in_the_same_inference_process(self) -> None:
        image = Image.new("RGB", (300, 200), color=(80, 120, 180))
        image_bytes = io.BytesIO()
        image.save(image_bytes, format="PNG")

        class Connection:
            def __init__(self) -> None:
                self.messages = []
                self.payloads = iter((image_bytes.getvalue(), None))

            def send(self, message) -> None:
                self.messages.append(message)

            def recv(self):
                return next(self.payloads)

        connection = Connection()
        inference_process(
            connection,
            os.environ["OPENNSFW_ONNX_MODEL_PATH"],
            os.environ["PERSON_YOLOX_ONNX_MODEL_PATH"],
            os.environ["PERSON_YUNET_ONNX_MODEL_PATH"],
            os.environ["GRAPHIC_SAFETY_ONNX_MODEL_PATH"],
        )

        self.assertTrue(connection.messages[0]["ready"])
        self.assertTrue(connection.messages[0]["graphicSafetyReady"])
        self.assertTrue(connection.messages[1]["ok"])
        self.assertLess(connection.messages[1]["graphicNsflProbability"], 0.20)

    def test_missing_or_corrupt_graphic_model_fails_worker_startup_closed(self) -> None:
        class Connection:
            def __init__(self) -> None:
                self.messages = []

            def send(self, message) -> None:
                self.messages.append(message)

        connection = Connection()
        inference_process(
            connection,
            os.environ["OPENNSFW_ONNX_MODEL_PATH"],
            os.environ["PERSON_YOLOX_ONNX_MODEL_PATH"],
            os.environ["PERSON_YUNET_ONNX_MODEL_PATH"],
            None,
        )
        self.assertEqual(connection.messages, [{
            "ready": False,
            "error": "graphic_model_not_configured",
        }])

        with tempfile.TemporaryDirectory() as temporary_directory:
            corrupt = pathlib.Path(temporary_directory) / "graphic.onnx"
            corrupt.write_bytes(b"not-an-onnx-model")
            connection = Connection()
            inference_process(
                connection,
                os.environ["OPENNSFW_ONNX_MODEL_PATH"],
                os.environ["PERSON_YOLOX_ONNX_MODEL_PATH"],
                os.environ["PERSON_YUNET_ONNX_MODEL_PATH"],
                str(corrupt),
            )

        self.assertEqual(connection.messages, [{
            "ready": False,
            "error": "graphic_model_checksum_mismatch",
        }])


if __name__ == "__main__":
    unittest.main()
