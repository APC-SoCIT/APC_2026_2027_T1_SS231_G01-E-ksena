import os
import tempfile
import urllib.request
from datetime import datetime, timezone
import uvicorn
from fastapi import FastAPI, BackgroundTasks, HTTPException, Header
from pydantic import BaseModel
from supabase import create_client, Client

app = FastAPI()

# Supports both lowercase and uppercase environment variables
SUPABASE_URL = os.environ.get("supabase_url") or os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("supabase_key") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
HF_WEBHOOK_SECRET = os.environ.get("HF_WEBHOOK_SECRET")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("Missing Supabase credentials in environment variables/secrets.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
MODEL_VERSION = "emergency-classifier-v1"


class VideoPayload(BaseModel):
    video_url: str = ""
    file_path: str = ""  # e.g., "incident-123.mp4"
    incident_id: str     # maps to UUID in ai_analysis table


def run_model_inference(local_video_path: str) -> tuple[str, float]:
    """
    Your actual video classification logic (e.g., PyTorch 3D-CNN, Video Transformer).
    Returns (predicted_service_type, confidence_score).
    Classes: 'fire', 'medical', 'police'
    """
    # Replace this placeholder with your real model inference:
    predicted_service_type = "fire"
    confidence_score = 0.96
    return predicted_service_type, confidence_score


def process_single_incident(incident_id: str, file_path: str = "", video_url: str = ""):
    """Classifies a video and inserts results into ai_analysis."""
    try:
        # 1. Obtain signed URL if direct URL was not provided
        if not video_url and file_path:
            signed_res = supabase.storage.from_("incident-videos").create_signed_url(file_path, 900)
            if "signedUrl" in signed_res:
                video_url = signed_res["signedUrl"]
            elif isinstance(signed_res, dict) and "signedURL" in signed_res:
                video_url = signed_res["signedURL"]
            else:
                raise ValueError(f"Could not generate signed URL for path: {file_path}")

        if not video_url:
            raise ValueError(f"No video URL or file path provided for incident {incident_id}")

        # 2. Download video to temporary storage
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as temp_video:
            urllib.request.urlretrieve(video_url, temp_video.name)

            # 3. Run model classification
            detected_type, confidence = run_model_inference(temp_video.name)

        # 4. Insert into the ai_analysis table matching your schema
        analysis_record = {
            "incident_id": incident_id,
            "model_version": MODEL_VERSION,
            "service_type": detected_type,
            "detected_service_type": detected_type,
            "confidence_score": float(confidence),
            "analysis_timestamp": datetime.now(timezone.utc).isoformat(),
        }

        supabase.table("ai_analysis").insert(analysis_record).execute()
        print(f"[SUCCESS] Classified incident {incident_id} as {detected_type} ({confidence})")

    except Exception as e:
        print(f"[ERROR] Failed processing incident {incident_id}: {str(e)}")


def process_all_unclassified_videos():
    """
    Finds incidents from the bucket or table that do not have
    an entry in ai_analysis yet, and runs inference on them.
    """
    try:
        # Step A: Get all incident_ids already processed
        analyzed_resp = supabase.table("ai_analysis").select("incident_id").execute()
        analyzed_ids = {row["incident_id"] for row in analyzed_resp.data if row.get("incident_id")}

        # Step B: Get files from the 'incident-videos' bucket
        # Note: adjust limit if you have more than 100 videos
        files = supabase.storage.from_("incident-videos").list(limit=100)

        for file_obj in files:
            file_name = file_obj.get("name")
            if not file_name or file_name.startswith("."):
                continue

            # Assume file name without extension matches incident_id (e.g. "<uuid>.mp4")
            # If your file name is stored in another table, query that table instead.
            incident_id = os.path.splitext(file_name)[0]

            if incident_id not in analyzed_ids:
                print(f"[QUEUE] Processing unanalyzed video: {file_name}")
                process_single_incident(incident_id=incident_id, file_path=file_name)

    except Exception as e:
        print(f"[ERROR] Batch classification scan failed: {str(e)}")


@app.get("/")
def health_check():
    return {"status": "ok", "message": "Emergency Classifier API is active"}


@app.post("/classify-emergency", status_code=202)
async def classify_emergency(
    payload: VideoPayload,
    background_tasks: BackgroundTasks,
    authorization: str = Header(None)
):
    """Triggered per incident from Supabase Edge Function or Webhook."""
    if HF_WEBHOOK_SECRET and authorization != f"Bearer {HF_WEBHOOK_SECRET}":
        raise HTTPException(status_code=401, detail="Unauthorized")

    background_tasks.add_task(
        process_single_incident,
        incident_id=payload.incident_id,
        file_path=payload.file_path,
        video_url=payload.video_url
    )
    return {"message": "Job queued for processing", "incident_id": payload.incident_id}


@app.post("/process-unclassified", status_code=202)
async def trigger_unclassified_batch(
    background_tasks: BackgroundTasks,
    authorization: str = Header(None)
):
    """Scans the bucket and processes any video without an ai_analysis record."""
    if HF_WEBHOOK_SECRET and authorization != f"Bearer {HF_WEBHOOK_SECRET}":
        raise HTTPException(status_code=401, detail="Unauthorized")

    background_tasks.add_task(process_all_unclassified_videos)
    return {"message": "Batch scan for unclassified videos started in background"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7860)