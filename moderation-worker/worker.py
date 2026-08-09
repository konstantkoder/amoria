"""Database-backed, self-hosted public-photo moderation worker.

The worker accepts no HTTP requests and no caller-provided paths or URLs. It claims a
trusted media ID from PostgreSQL, rechecks current avatar/public eligibility, then reads
the corresponding private S3 object. Locked gallery objects are cancelled before any
storage call. Inference runs in a supervised child process so a timeout can be killed.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import multiprocessing
import os
import pathlib
import signal
import sys
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError
from PIL import Image, UnidentifiedImageError
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

ENGINE = "opennsfw_onnx_cpu"
MODEL_VERSION = "yahoo_open_nsfw_resnet50_1by2/opennsfw-onnx@0.1.0"
POLICY_VERSION = "amoria_public_photo_v1"
MODEL_SHA256 = "864bb37bf8863564b87eb330ab8c785a79a773f4e7c43cb96db52ed8611305fa"


@dataclass(frozen=True)
class Config:
    database_url: str
    s3_endpoint: str
    s3_region: str
    s3_access_key: str
    s3_secret_key: str
    s3_bucket: str
    concurrency: int
    poll_seconds: float
    max_attempts: int
    retry_base_seconds: int
    max_image_bytes: int
    max_dimension: int
    inference_timeout_seconds: int
    running_timeout_seconds: int
    approve_max_nsfw: float
    restrict_min_nsfw: float
    model_path: str | None


class ModerationFailure(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def load_config() -> Config:
    cfg = Config(
        database_url=required("DATABASE_URL"),
        s3_endpoint=required("S3_ENDPOINT"),
        s3_region=os.getenv("S3_REGION", "us-east-1").strip(),
        s3_access_key=required("S3_ACCESS_KEY"),
        s3_secret_key=required("S3_SECRET_KEY"),
        s3_bucket=required("S3_BUCKET"),
        concurrency=integer_env("MODERATION_WORKER_CONCURRENCY", 1, 1, 2),
        poll_seconds=float_env("MODERATION_WORKER_POLL_SECONDS", 2.0, 0.1, 60.0),
        max_attempts=integer_env("MODERATION_MAX_ATTEMPTS", 3, 1, 10),
        retry_base_seconds=integer_env("MODERATION_RETRY_BASE_SECONDS", 15, 1, 3600),
        max_image_bytes=integer_env("MODERATION_MAX_IMAGE_BYTES", 10 * 1024 * 1024, 1, 20 * 1024 * 1024),
        max_dimension=integer_env("MODERATION_MAX_DIMENSION", 4096, 64, 8192),
        inference_timeout_seconds=integer_env("MODERATION_INFERENCE_TIMEOUT_SECONDS", 30, 1, 300),
        running_timeout_seconds=integer_env("MODERATION_RUNNING_TIMEOUT_SECONDS", 180, 60, 3600),
        approve_max_nsfw=float_env("MODERATION_APPROVE_MAX_NSFW", 0.20, 0.0, 1.0),
        restrict_min_nsfw=float_env("MODERATION_RESTRICT_MIN_NSFW", 0.80, 0.0, 1.0),
        model_path=os.getenv("OPENNSFW_ONNX_MODEL_PATH") or None,
    )
    if cfg.approve_max_nsfw >= cfg.restrict_min_nsfw:
        raise RuntimeError("MODERATION_APPROVE_MAX_NSFW must be less than MODERATION_RESTRICT_MIN_NSFW")
    return cfg


def required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def integer_env(name: str, default: int, minimum: int, maximum: int) -> int:
    value = int(os.getenv(name, str(default)))
    if value < minimum or value > maximum:
        raise RuntimeError(f"{name} must be between {minimum} and {maximum}")
    return value


def float_env(name: str, default: float, minimum: float, maximum: float) -> float:
    value = float(os.getenv(name, str(default)))
    if value < minimum or value > maximum:
        raise RuntimeError(f"{name} must be between {minimum} and {maximum}")
    return value


def safe_log(event: str, **fields: Any) -> None:
    record = {"event": event, "timestamp": datetime.now(timezone.utc).isoformat(), **fields}
    print(json.dumps(record, separators=(",", ":"), sort_keys=True), flush=True)


def inference_process(connection: Any, model_path: str | None) -> None:
    from opennsfw_onnx import NSFWClassifier
    import opennsfw_onnx

    resolved = pathlib.Path(model_path) if model_path else next(
        pathlib.Path(opennsfw_onnx.__file__).parent.glob("*.onnx")
    )
    actual_checksum = hashlib.sha256(resolved.read_bytes()).hexdigest()
    if actual_checksum != MODEL_SHA256:
        connection.send({"ready": False, "error": "model_checksum_mismatch"})
        return

    started = time.perf_counter()
    classifier = NSFWClassifier(
        model_path=str(resolved),
        providers=["CPUExecutionProvider"],
        intra_op_num_threads=max(1, min(4, os.cpu_count() or 1)),
    )
    classifier.warmup()
    connection.send({
        "ready": True,
        "loadMs": round((time.perf_counter() - started) * 1000, 3),
        "modelSizeBytes": resolved.stat().st_size,
        "modelSha256": actual_checksum,
    })

    while True:
        payload = connection.recv()
        if payload is None:
            return
        started = time.perf_counter()
        try:
            prediction = classifier.classify(payload)
            connection.send({
                "ok": True,
                "nsfwProbability": float(prediction.nsfw),
                "sfwProbability": float(prediction.sfw),
                "inferenceMs": round((time.perf_counter() - started) * 1000, 3),
            })
        except Exception:
            connection.send({"ok": False, "error": "classifier_failed"})


class InferenceSupervisor:
    def __init__(self, cfg: Config, worker_index: int) -> None:
        self.cfg = cfg
        self.worker_index = worker_index
        self.context = multiprocessing.get_context("spawn")
        self.process: multiprocessing.Process | None = None
        self.connection: Any = None

    def start(self) -> None:
        parent, child = self.context.Pipe()
        self.connection = parent
        self.process = self.context.Process(
            target=inference_process,
            args=(child, self.cfg.model_path),
            name=f"amoria-moderation-inference-{self.worker_index}",
        )
        self.process.start()
        if not parent.poll(120):
            self.stop(force=True)
            raise RuntimeError("Local moderation model load timed out")
        ready = parent.recv()
        if not ready.get("ready"):
            self.stop(force=True)
            raise RuntimeError(f"Local moderation model failed to load: {ready.get('error', 'unknown')}")
        safe_log("model_ready", workerIndex=self.worker_index, modelVersion=MODEL_VERSION, **ready)

    def classify(self, image_bytes: bytes) -> dict[str, Any]:
        if not self.process or not self.process.is_alive():
            self.start()
        self.connection.send(image_bytes)
        if not self.connection.poll(self.cfg.inference_timeout_seconds):
            self.stop(force=True)
            raise ModerationFailure("inference_timeout", "Local classifier timed out")
        result = self.connection.recv()
        if not result.get("ok"):
            raise ModerationFailure("classifier_failed", "Local classifier failed")
        return result

    def stop(self, force: bool = False) -> None:
        if self.process and self.process.is_alive():
            if not force:
                try:
                    self.connection.send(None)
                    self.process.join(timeout=3)
                except Exception:
                    pass
            if self.process.is_alive():
                self.process.terminate()
                self.process.join(timeout=3)
        self.process = None
        self.connection = None


class JobRunner:
    def __init__(self, cfg: Config, worker_index: int) -> None:
        self.cfg = cfg
        self.worker_index = worker_index
        self.inference = InferenceSupervisor(cfg, worker_index)
        self.s3 = boto3.client(
            "s3",
            endpoint_url=cfg.s3_endpoint,
            region_name=cfg.s3_region,
            aws_access_key_id=cfg.s3_access_key,
            aws_secret_access_key=cfg.s3_secret_key,
            config=BotoConfig(
                connect_timeout=5,
                read_timeout=10,
                retries={"max_attempts": 1, "mode": "standard"},
                s3={"addressing_style": "path"},
            ),
        )

    def run(self, once: bool, stop_event: threading.Event) -> None:
        self.inference.start()
        try:
            while not stop_event.is_set():
                job = self.claim_job()
                if job is None:
                    if once:
                        return
                    stop_event.wait(self.cfg.poll_seconds)
                    continue
                self.process_job(job)
                if once:
                    return
        finally:
            self.inference.stop()

    def connect(self) -> psycopg.Connection:
        return psycopg.connect(self.cfg.database_url, row_factory=dict_row)

    def recover_stale_jobs(self) -> int:
        """Recover jobs abandoned by a terminated worker without widening scan scope."""
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(seconds=self.cfg.running_timeout_seconds)
        recovered = 0
        with self.connect() as connection, connection.transaction():
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT j.id, j.media_id, j.attempt_count, m.owner_user_id, m.type,
                           m.moderation_state, m.url, g.visibility
                    FROM media_moderation_jobs j
                    JOIN media_files m ON m.id=j.media_id
                    LEFT JOIN profile_gallery_items g ON g.media_id=m.id
                    WHERE j.status='running' AND j.started_at < %s
                    ORDER BY j.started_at
                    FOR UPDATE OF j, m SKIP LOCKED
                    """,
                    (cutoff,),
                )
                for stale in cursor.fetchall():
                    recovered += 1
                    if not automatically_scannable(stale):
                        cursor.execute(
                            """
                            UPDATE media_moderation_jobs
                            SET status='cancelled', completed_at=%s, updated_at=%s,
                                error_code='media_not_public'
                            WHERE id=%s
                            """,
                            (now, now, stale["id"]),
                        )
                    elif stale["attempt_count"] < self.cfg.max_attempts:
                        delay = self.cfg.retry_base_seconds * (2 ** max(0, stale["attempt_count"] - 1))
                        cursor.execute(
                            """
                            UPDATE media_moderation_jobs
                            SET status='queued', next_attempt_at=%s, started_at=NULL,
                                updated_at=%s, error_code='worker_lease_expired'
                            WHERE id=%s
                            """,
                            (now + timedelta(seconds=delay), now, stale["id"]),
                        )
                    else:
                        cursor.execute(
                            """
                            UPDATE media_moderation_jobs
                            SET status='failed', completed_at=%s, updated_at=%s,
                                error_code='worker_lease_expired'
                            WHERE id=%s
                            """,
                            (now, now, stale["id"]),
                        )
                        cursor.execute(
                            """
                            UPDATE media_files
                            SET moderation_state='needs_review', moderation_origin='automation_failed',
                                moderation_updated_at=%s
                            WHERE id=%s AND moderation_state <> 'removed'
                            """,
                            (now, stale["media_id"]),
                        )
                        cursor.execute(
                            """
                            INSERT INTO media_moderation_reviews
                              (media_id, owner_user_id, admin_user_id, action, reason, metadata)
                            VALUES (%s, %s, NULL, 'mark_under_review',
                                    'Local automated moderation worker lease expired after bounded retries', %s)
                            """,
                            (
                                stale["media_id"],
                                stale["owner_user_id"],
                                Jsonb({
                                    "source": "automated_media_moderation",
                                    "automatedStatus": "failed",
                                    "errorCode": "worker_lease_expired",
                                }),
                            ),
                        )
                        sync_owner_media_references(cursor, stale, "needs_review")
        if recovered:
            safe_log("stale_jobs_recovered", count=recovered)
        return recovered

    def claim_job(self) -> dict[str, Any] | None:
        with self.connect() as connection, connection.transaction():
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT j.id, j.media_id, j.attempt_count
                    FROM media_moderation_jobs j
                    WHERE j.status = 'queued' AND j.next_attempt_at <= now()
                    ORDER BY j.next_attempt_at, j.created_at
                    FOR UPDATE OF j SKIP LOCKED
                    LIMIT 1
                    """
                )
                job = cursor.fetchone()
                if not job:
                    return None
                cursor.execute(
                    """
                    SELECT m.id, m.owner_user_id, m.type, m.path, m.mime_type, m.size_bytes,
                           m.width, m.height, m.moderation_state, g.visibility
                    FROM media_files m
                    LEFT JOIN profile_gallery_items g ON g.media_id = m.id
                    WHERE m.id = %s
                    """,
                    (job["media_id"],),
                )
                media = cursor.fetchone()
                if not media or not automatically_scannable(media):
                    cursor.execute(
                        """
                        UPDATE media_moderation_jobs
                        SET status = 'cancelled', completed_at = now(), updated_at = now(),
                            error_code = 'media_not_public'
                        WHERE id = %s
                        """,
                        (job["id"],),
                    )
                    safe_log("job_cancelled_not_public", jobId=str(job["id"]), mediaId=str(job["media_id"]))
                    return None
                attempt = int(job["attempt_count"]) + 1
                cursor.execute(
                    """
                    UPDATE media_moderation_jobs
                    SET status = 'running', attempt_count = %s, started_at = now(),
                        completed_at = NULL, error_code = NULL, updated_at = now()
                    WHERE id = %s
                    """,
                    (attempt, job["id"]),
                )
                return build_claimed_job(media, job, attempt)

    def process_job(self, job: dict[str, Any]) -> None:
        started = time.perf_counter()
        job_id = str(job["id"])
        media_id = str(job["media_id"])
        try:
            with self.connect() as connection, connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT m.type
                        FROM media_moderation_jobs j
                        JOIN media_files m ON m.id=j.media_id
                        WHERE j.id=%s AND m.id=%s
                        """,
                        (job["id"], job["media_id"]),
                    )
                    preliminary = cursor.fetchone()
                    gallery_visibility = None
                    if preliminary and preliminary["type"] == "profile_photo":
                        cursor.execute(
                            "SELECT visibility FROM profile_gallery_items WHERE media_id=%s FOR SHARE",
                            (job["media_id"],),
                        )
                        gallery = cursor.fetchone()
                        gallery_visibility = gallery["visibility"] if gallery else None
                    current = lock_job_and_media(cursor, job["id"], job["media_id"])
                    if current and current["type"] == "profile_photo":
                        current["visibility"] = gallery_visibility
                    if (
                        not current
                        or current["status"] != "running"
                        or current["attempt_count"] != job["attempt_count"]
                        or not automatically_scannable(current)
                    ):
                        if current and current["status"] == "running":
                            cursor.execute(
                                """
                                UPDATE media_moderation_jobs
                                SET status='cancelled', completed_at=now(), updated_at=now(),
                                    error_code='media_not_public'
                                WHERE id=%s
                                """,
                                (job["id"],),
                            )
                        safe_log("job_cancelled_not_public", jobId=job_id, mediaId=media_id)
                        return

                    # Row locks keep a public gallery item public for the entire byte read,
                    # decode, inference, and state transition. A public-to-locked update waits
                    # here and takes effect only after the worker has released all content.
                    image_bytes = self.read_object(current)
                    validate_image(image_bytes, self.cfg)
                    result = self.inference.classify(image_bytes)
                    decision = decide_policy(result["nsfwProbability"], self.cfg)
                    raw_result = to_raw_result(result, self.cfg)
                    self.complete_locked_job(cursor, job, current, decision, raw_result)
            safe_log(
                "job_completed",
                jobId=job_id,
                mediaId=media_id,
                decision=decision,
                durationMs=round((time.perf_counter() - started) * 1000, 3),
                inferenceMs=result["inferenceMs"],
                modelVersion=MODEL_VERSION,
            )
        except ModerationFailure as error:
            self.fail_job(job, error.code)
            safe_log(
                "job_failed",
                jobId=job_id,
                mediaId=media_id,
                errorCode=error.code,
                attemptCount=job["attempt_count"],
                durationMs=round((time.perf_counter() - started) * 1000, 3),
            )
        except Exception:
            self.fail_job(job, "worker_error")
            safe_log("job_failed", jobId=job_id, mediaId=media_id, errorCode="worker_error")

    def read_object(self, job: dict[str, Any]) -> bytes:
        try:
            response = self.s3.get_object(Bucket=self.cfg.s3_bucket, Key=job["path"])
            content_length = int(response.get("ContentLength", 0))
            if content_length < 1 or content_length > self.cfg.max_image_bytes:
                raise ModerationFailure("image_size_invalid", "Image size is outside worker bounds")
            body = response["Body"]
            data = body.read(self.cfg.max_image_bytes + 1)
            body.close()
            if len(data) != content_length or len(data) > self.cfg.max_image_bytes:
                raise ModerationFailure("image_size_invalid", "Image read exceeded worker bounds")
            return data
        except ModerationFailure:
            raise
        except ClientError as error:
            status = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            code = "object_missing" if status == 404 else "storage_read_failed"
            raise ModerationFailure(code, "Private media object could not be read") from error
        except Exception as error:
            raise ModerationFailure("storage_read_failed", "Private media object could not be read") from error

    def complete_locked_job(
        self,
        cursor: Any,
        job: dict[str, Any],
        current: dict[str, Any],
        decision: str,
        raw_result: dict[str, Any],
    ) -> None:
        state = {"approve": "approved", "needs_review": "needs_review", "restrict": "restricted"}[decision]
        action = {"approve": "approve", "needs_review": "mark_under_review", "restrict": "restrict"}[decision]
        now = datetime.now(timezone.utc)
        metadata = {
            "source": "automated_media_moderation",
            "automatedStatus": "completed",
            "automatedProvider": ENGINE,
            "modelVersion": MODEL_VERSION,
            "policyVersion": POLICY_VERSION,
            "policyDecision": decision,
            **raw_result,
        }
        cursor.execute(
            """
            UPDATE media_moderation_jobs
            SET status='completed', completed_at=%s, updated_at=%s, raw_result=%s,
                policy_decision=%s, error_code=NULL
            WHERE id=%s
            """,
            (now, now, Jsonb(raw_result), decision, job["id"]),
        )
        cursor.execute(
            """
            UPDATE media_files
            SET moderation_state=%s, moderation_origin='automated',
                automated_checked_at=%s, moderation_updated_at=%s
            WHERE id=%s
            """,
            (state, now, now, job["media_id"]),
        )
        cursor.execute(
            """
            INSERT INTO media_moderation_reviews
              (media_id, owner_user_id, admin_user_id, action, reason, metadata)
            VALUES (%s, %s, NULL, %s, %s, %s)
            """,
            (
                job["media_id"],
                current["owner_user_id"],
                action,
                f"Automated local moderation policy decision: {decision}",
                Jsonb(metadata),
            ),
        )
        sync_owner_media_references(cursor, current, decision)

    def fail_job(self, job: dict[str, Any], error_code: str) -> None:
        now = datetime.now(timezone.utc)
        with self.connect() as connection, connection.transaction():
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT status, attempt_count FROM media_moderation_jobs WHERE id=%s FOR UPDATE",
                    (job["id"],),
                )
                current = cursor.fetchone()
                if not current or current["status"] != "running" or current["attempt_count"] != job["attempt_count"]:
                    return
                if job["attempt_count"] < self.cfg.max_attempts:
                    delay = self.cfg.retry_base_seconds * (2 ** (job["attempt_count"] - 1))
                    cursor.execute(
                        """
                        UPDATE media_moderation_jobs
                        SET status='queued', next_attempt_at=%s, started_at=NULL,
                            updated_at=%s, error_code=%s
                        WHERE id=%s
                        """,
                        (now + timedelta(seconds=delay), now, error_code, job["id"]),
                    )
                    return
                cursor.execute(
                    """
                    UPDATE media_moderation_jobs
                    SET status='failed', completed_at=%s, updated_at=%s, error_code=%s
                    WHERE id=%s
                    """,
                    (now, now, error_code, job["id"]),
                )
                cursor.execute(
                    """
                    UPDATE media_files
                    SET moderation_state='needs_review', moderation_origin='automation_failed',
                        moderation_updated_at=%s
                    WHERE id=%s AND moderation_state <> 'removed'
                    """,
                    (now, job["media_id"]),
                )
                cursor.execute(
                    """
                    INSERT INTO media_moderation_reviews
                      (media_id, owner_user_id, admin_user_id, action, reason, metadata)
                    SELECT id, owner_user_id, NULL, 'mark_under_review',
                           'Local automated moderation failed after bounded retries', %s
                    FROM media_files WHERE id=%s
                    """,
                    (Jsonb({"source": "automated_media_moderation", "automatedStatus": "failed", "errorCode": error_code}), job["media_id"]),
                )


def automatically_scannable(media: dict[str, Any]) -> bool:
    if media.get("moderation_state") == "removed":
        return False
    if media.get("type") == "avatar":
        return True
    return media.get("type") == "profile_photo" and media.get("visibility") == "public"


def build_claimed_job(media: dict[str, Any], job: dict[str, Any], attempt: int) -> dict[str, Any]:
    """Keep the durable job identity even though both query records expose an `id`."""
    return {**media, **job, "id": job["id"], "media_id": job["media_id"], "attempt_count": attempt}


def validate_image(image_bytes: bytes, cfg: Config) -> None:
    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            width, height = image.size
            if width < 1 or height < 1 or width > cfg.max_dimension or height > cfg.max_dimension:
                raise ModerationFailure("image_dimensions_invalid", "Image dimensions are outside worker bounds")
            image.verify()
    except ModerationFailure:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as error:
        raise ModerationFailure("image_decode_failed", "Sanitized image could not be decoded") from error


def decide_policy(nsfw_probability: float, cfg: Config) -> str:
    if nsfw_probability <= cfg.approve_max_nsfw:
        return "approve"
    if nsfw_probability >= cfg.restrict_min_nsfw:
        return "restrict"
    return "needs_review"


def to_raw_result(result: dict[str, Any], cfg: Config) -> dict[str, Any]:
    nsfw_probability = float(result["nsfwProbability"])
    signal = "safe" if nsfw_probability <= cfg.approve_max_nsfw else (
        "unsafe" if nsfw_probability >= cfg.restrict_min_nsfw else "unknown"
    )
    return {
        "containsPerson": "unknown",
        "nsfw": signal,
        "violence": "unknown",
        "confidence": {
            "nsfw": nsfw_probability,
            "sfw": float(result["sfwProbability"]),
        },
        "labels": [
            {"label": "nsfw", "confidence": nsfw_probability},
            {"label": "sfw", "confidence": float(result["sfwProbability"])},
        ],
        "needsHumanReview": signal == "unknown",
        "inferenceMs": result["inferenceMs"],
        "checkedAt": datetime.now(timezone.utc).isoformat(),
    }


def lock_job_and_media(cursor: Any, job_id: Any, media_id: Any) -> dict[str, Any] | None:
    cursor.execute(
        """
        SELECT j.status, j.attempt_count, m.id AS media_id, m.owner_user_id, m.type, m.moderation_state,
               m.path, m.mime_type, m.size_bytes, m.width, m.height, m.url, g.visibility
        FROM media_moderation_jobs j
        JOIN media_files m ON m.id = j.media_id
        LEFT JOIN profile_gallery_items g ON g.media_id = m.id
        WHERE j.id=%s AND m.id=%s
        FOR UPDATE OF j, m
        """,
        (job_id, media_id),
    )
    return cursor.fetchone()


def sync_owner_media_references(cursor: Any, media: dict[str, Any], decision: str) -> None:
    if media["type"] == "avatar":
        if decision == "approve":
            cursor.execute("SELECT avatar_url FROM users WHERE id=%s FOR UPDATE", (media["owner_user_id"],))
            owner = cursor.fetchone()
            previous_avatar_url = owner["avatar_url"] if owner else None
            cursor.execute(
                """
                UPDATE users u SET avatar_url=%s, updated_at=now()
                WHERE u.id=%s AND NOT EXISTS (
                  SELECT 1 FROM media_files newer
                  JOIN media_files current ON current.id=%s
                  WHERE newer.owner_user_id=current.owner_user_id AND newer.type='avatar'
                    AND newer.moderation_state <> 'removed'
                    AND (newer.created_at, newer.id) > (current.created_at, current.id)
                )
                """,
                (media["url"], media["owner_user_id"], media["media_id"] if "media_id" in media else None),
            )
            adopted = cursor.rowcount > 0
            if adopted:
                cursor.execute(
                    """
                    UPDATE media_files
                    SET moderation_state='removed', moderation_origin='avatar_replaced',
                        moderation_updated_at=now()
                    WHERE owner_user_id=%s AND type='avatar'
                      AND id<>%s AND moderation_state<>'removed'
                      AND (
                        (%s IS NOT NULL AND url=%s)
                        OR created_at < (SELECT created_at FROM media_files WHERE id=%s)
                      )
                    RETURNING id
                    """,
                    (
                        media["owner_user_id"],
                        media["media_id"],
                        previous_avatar_url,
                        previous_avatar_url,
                        media["media_id"],
                    ),
                )
                for retired in cursor.fetchall():
                    cursor.execute(
                        """
                        UPDATE media_moderation_jobs
                        SET status='cancelled', completed_at=now(), updated_at=now(),
                            error_code='avatar_replaced'
                        WHERE media_id=%s AND status IN ('queued','running')
                        """,
                        (retired["id"],),
                    )
                    cursor.execute(
                        """
                        INSERT INTO media_moderation_reviews
                          (media_id, owner_user_id, admin_user_id, action, reason, metadata)
                        VALUES (%s, %s, NULL, 'remove', 'Superseded by a newly approved avatar', %s)
                        """,
                        (
                            retired["id"],
                            media["owner_user_id"],
                            Jsonb({"source": "avatar_replacement", "replacementMediaId": str(media["media_id"])}),
                        ),
                    )
        elif decision == "restrict":
            cursor.execute(
                "UPDATE users SET avatar_url=NULL, updated_at=now() WHERE id=%s AND avatar_url=%s",
                (media["owner_user_id"], media["url"]),
            )
        return

    cursor.execute(
        """
        UPDATE users u SET photos=COALESCE((
          SELECT jsonb_agg(jsonb_build_object('mediaId', m.id::text, 'url', m.url) ORDER BY g.position)
          FROM profile_gallery_items g
          JOIN media_files m ON m.id=g.media_id
          WHERE g.user_id=u.id AND g.visibility='public' AND m.moderation_state='approved'
        ), '[]'::jsonb), updated_at=now()
        WHERE u.id=%s
        """,
        (media["owner_user_id"],),
    )


def main() -> int:
    multiprocessing.freeze_support()
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="Process at most one job per worker slot, then exit")
    args = parser.parse_args()
    cfg = load_config()
    stop_event = threading.Event()

    def request_stop(*_: Any) -> None:
        stop_event.set()

    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGTERM, request_stop)
    safe_log(
        "worker_started",
        engine=ENGINE,
        modelVersion=MODEL_VERSION,
        policyVersion=POLICY_VERSION,
        concurrency=cfg.concurrency,
        maxAttempts=cfg.max_attempts,
    )
    runners = [JobRunner(cfg, index) for index in range(cfg.concurrency)]
    runners[0].recover_stale_jobs()
    failures: list[str] = []

    def run_slot(runner: JobRunner) -> None:
        try:
            runner.run(args.once, stop_event)
        except Exception as error:
            failures.append(type(error).__name__)
            safe_log("worker_slot_failed", workerIndex=runner.worker_index, errorCode="worker_startup_failed")
            stop_event.set()

    threads = [
        threading.Thread(
            target=run_slot,
            args=(runners[index],),
            name=f"moderation-slot-{index}",
        )
        for index in range(cfg.concurrency)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    safe_log("worker_stopped", failed=bool(failures))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
