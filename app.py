import os
import tempfile
import urllib.request
from datetime import datetime, timezone
import uvicorn
from fastapi import FastAPI, BackgroundTasks, HTTPException, Header
from pydantic import BaseModel
from supabase import create_client, Client

app = FastAPI()

# Supports both lowercase and uppercase environment variable names
SUPABASE_URL = os.environ.get("supabase_url") or os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("supabase_key") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
HF_WEBHOOK_SECRET = os.environ.get("HF_WEBHOOK_SECRET")

# Configurable model version tag
MODEL_VERSION = os.environ.get("MODEL_VERSION", "v1.0.0")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("Missing Supabase credentials in environment variables/secrets.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


class VideoPayload(BaseModel):
    video_url: str
    record_id: str  # Maps to incident_id (uuid)


def process_and_classify(video_url: str, record_id: str):
    """Background worker function executing heavy video classification."""
    try:
        # 1. Update status in parent emergency_reports table
        supabase.table("emergency_reports").update({
            "status": "processing"
        }).eq("id", record_id).execute()

        # 2. Download video to local temporary file
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as temp_video:
            urllib.request.urlretrieve(video_url, temp_video.name)

            # 3. Model inference logic (replace with your actual PyTorch model call)
            # Labels: "fire", "medical", or "police"
            predicted_class = "fire"
            confidence_score = 0.96

        # 4. Insert analysis record into the ai_analysis table
        supabase.table("ai_analysis").insert({
            "incident_id": record_id,
            "model_version": MODEL_VERSION,
            "service_type": predicted_class,
            "detected_service_type": predicted_class,
            "confidence_score": float(confidence_score),
            "analysis_timestamp": datetime.now(timezone.utc).isoformat(),
        }).execute()

        # 5. Mark the incident record as completed
        supabase.table("emergency_reports").update({
            "status": "classified",
            "category": predicted_class,
            "confidence": confidence_score
        }).eq("id", record_id).execute()

    except Exception as e:
        # Update incident record with failure details
        supabase.table("emergency_reports").update({
            "status": "failed",
            "error_log": str(e)
        }).eq("id", record_id).execute()


@app.get("/")
def health_check():
    """Health check endpoint to keep Hugging Face Space running."""
    return {"status": "ok", "message": "Emergency Classifier API is active"}


@app.post("/classify-emergency", status_code=202)
async def classify_emergency(
    payload: VideoPayload,
    background_tasks: BackgroundTasks,
    authorization: str = Header(None)
):
    # Verify incoming token
    if authorization != f"Bearer {HF_WEBHOOK_SECRET}":
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Queue the heavy job in the background and return immediately
    background_tasks.add_task(process_and_classify, payload.video_url, payload.record_id)

    return {"message": "Job queued for processing", "record_id": payload.record_id}


# Hugging Face Spaces require listening on 0.0.0.0:7860
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7860)