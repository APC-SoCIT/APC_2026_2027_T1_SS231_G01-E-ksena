import os
import tempfile
import urllib.request
from fastapi import FastAPI, BackgroundTasks, HTTPException, Header
from pydantic import BaseModel
from supabase import create_client, Client

app = FastAPI()

SUPABASE_URL = os.environ.get("supabase_url")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("supabase_key")
HF_WEBHOOK_SECRET = os.environ.get("HF_WEBHOOK_SECRET")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

class VideoPayload(BaseModel):
    video_url: str
    record_id: str

def process_and_classify(video_url: str, record_id: str):
    """Background worker function executing heavy video classification."""
    try:
        # Mark record as processing in database
        supabase.table("emergency_reports").update({
            "status": "processing"
        }).eq("id", record_id).execute()

        # Download video to local temp file
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as temp_video:
            urllib.request.urlretrieve(video_url, temp_video.name)
            
            # Run model inference (custom PyTorch / Video model)
            # Example placeholder inference:
            predicted_class = "fire"
            confidence_score = 0.96

        # Write successful predictions back to Supabase
        supabase.table("emergency_reports").update({
            "status": "classified",
            "category": predicted_class,
            "confidence": confidence_score
        }).eq("id", record_id).execute()

    except Exception as e:
        # Handle failures gracefully so the record isn't left stuck in processing
        supabase.table("emergency_reports").update({
            "status": "failed",
            "error_log": str(e)
        }).eq("id", record_id).execute()

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