import unittest

from worker import (
    Config,
    InferenceSupervisor,
    ModerationFailure,
    automatically_scannable,
    build_claimed_job,
    decide_person_presence,
    decide_policy,
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
    )


class WorkerPolicyTests(unittest.TestCase):
    def test_policy_boundaries_are_separate_from_model_output(self) -> None:
        cfg = config()
        self.assertEqual(decide_policy(0.20, cfg), "approve")
        self.assertEqual(decide_policy(0.50, cfg), "needs_review")
        self.assertEqual(decide_policy(0.80, cfg), "needs_review")
        self.assertEqual(decide_policy(0.95, cfg), "restrict")

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
        }, config())
        self.assertEqual(result["containsPerson"], "unknown")
        self.assertEqual(result["personPresence"]["errorCode"], "person_model_not_configured")

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


if __name__ == "__main__":
    unittest.main()
