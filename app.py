import os
import tempfile
import urllib.request
import torch
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from supabase import create_client, Client

app = FastAPI()

# Environment secrets configured in Hugging Face Space Settings
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
HF_WEBHOOK_SECRET = os.environ.get("HF_WEBHOOK_SECRET")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Load your emergency classifier model once on startup
# e.g., model = load_video_model()
LABELS = ["fire", "medical", "police"]

class VideoPayload(BaseModel):
    video_url: str
    record_id: str  # ID in your database to update

def predict_video(video_path: str) -> dict:
    """Preprocess video frames and run classification."""
    # Your frame sampling / 3D-CNN / Vision Transformer logic here
    # Return predicted label and confidence scores
    return {"label": "fire", "confidence": 0.94}

@app.post("/classify-emergency")
async def classify_emergency(payload: VideoPayload, authorization: str = Header(None)):
    # Validate secret header
    if authorization != f"Bearer {HF_WEBHOOK_SECRET}":
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Download video to a temporary file
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as temp_video:
        try:
            urllib.request.urlretrieve(payload.video_url, temp_video.name)
            result = predict_video(temp_video.name)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

    # Update classification record directly in Supabase
    supabase.table("emergency_reports").update({
        "status": "classified",
        "category": result["label"],
        "confidence": result["confidence"]
    }).eq("id", payload.record_id).execute()

    return {"status": "success", "result": result}