import os
import tempfile
import urllib.request
from datetime import datetime, timezone
import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.models.video as models
import uvicorn
import mediapipe as mp

from fastapi import FastAPI, BackgroundTasks, HTTPException, Header
from pydantic import BaseModel
from supabase import create_client, Client

app = FastAPI()

# --- 1. Environment & Supabase Setup ---
SUPABASE_URL = os.environ.get("supabase_url") or os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("supabase_key") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
HF_WEBHOOK_SECRET = os.environ.get("HF_WEBHOOK_SECRET")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("Missing Supabase credentials in environment variables/secrets.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# --- 2. 3D-CNN Model Configuration & Architecture ---
IMG_SIZE = (112, 112)
NUM_FRAMES = 16
LABEL_NAMES = ["Fire", "Police", "Medical"]
MODEL_VERSION = "emergency_ai3"
MODEL_WEIGHTS_PATH = "emergency_r3d18.pth"

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Initialize Torchvision R3D-18 video architecture to match saved state_dict layers
model = models.r3d_18(pretrained=False)
num_ftrs = model.fc.in_features
model.fc = nn.Sequential(
    nn.Dropout(0.5),
    nn.Linear(num_ftrs, len(LABEL_NAMES))
)
model = model.to(device)

# Load model weights globally on startup
if os.path.exists(MODEL_WEIGHTS_PATH):
    model.load_state_dict(torch.load(MODEL_WEIGHTS_PATH, map_location=device))
    model.eval()
    print(f"Loaded {MODEL_WEIGHTS_PATH} on {device}")
else:
    model.eval()
    print(f"Warning: {MODEL_WEIGHTS_PATH} not found. Running with initialized weights.")

# Load OpenCV built-in Haar Cascade face detectors cleanly
FRONTAL_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
PROFILE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_profileface.xml')


class VideoPayload(BaseModel):
    video_url: str = ""
    file_path: str = ""
    incident_id: str


# --- 3. Implementation 2: Full Video Face Blurring ---
def anonymize_video_file(input_path: str, output_path: str, detect_every_n: int = 4):
    """
    Reads an input MP4, detects frontal and side-profile faces across frames,
    blurs all matches, and writes the anonymized video to output_path.
    """
    cap = cv2.VideoCapture(input_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    cached_faces = []
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # Detect faces every Nth frame to keep CPU processing fast
        if frame_idx % detect_every_n == 0:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            
            # 1. Detect frontal faces
            frontal = FRONTAL_CASCADE.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
            
            # 2. Detect side-view profile faces (normal orientation)
            profile1 = PROFILE_CASCADE.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
            
            # 3. Detect side-view profile faces (flipped orientation for opposite direction profiles)
            gray_flipped = cv2.flip(gray, 1)
            profile2 = PROFILE_CASCADE.detectMultiScale(gray_flipped, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
            
            # Adjust flipped profile coordinates back to original frame layout
            fixed_profile2 = []
            for (x, y, w, h) in profile2:
                orig_x = width - x - w
                fixed_profile2.append((orig_x, y, w, h))

            # Combine all detections
            cached_faces = list(frontal) + list(profile1) + list(fixed_profile2)

        # Blur each detected face region with 15% padding
        for (x, y, w, h) in cached_faces:
            pad_w, pad_h = int(w * 0.15), int(h * 0.15)
            x1, y1 = max(0, x - pad_w), max(0, y - pad_h)
            x2, y2 = min(width, x + w + pad_w), min(height, y + h + pad_h)

            roi = frame[y1:y2, x1:x2]
            if roi.size != 0:
                kw = max(15, ((x2 - x1) // 3) | 1)
                kh = max(15, ((y2 - y1) // 3) | 1)
                frame[y1:y2, x1:x2] = cv2.GaussianBlur(roi, (kw, kh), 30)

        out.write(frame)
        frame_idx += 1

    cap.release()
    out.release()


# --- 4. 3D-CNN Video Preprocessing & Inference ---
def run_model_inference(local_video_path: str) -> tuple[str, float]:
    """Samples 16 frames from the video and runs the Torchvision R3D-18 classifier."""
    cap = cv2.VideoCapture(local_video_path)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    indices = np.linspace(0, max(0, total - 1), NUM_FRAMES, dtype=int)

    video_frames = []
    for i in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, i)
        ret, frame = cap.read()
        if ret:
            frame = cv2.resize(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB), IMG_SIZE)
            video_frames.append(frame)
        else:
            video_frames.append(np.zeros((*IMG_SIZE, 3), dtype=np.uint8))
    cap.release()

    frames_np = np.array(video_frames)
    tensor = torch.from_numpy(frames_np).float() / 255.0
    # Permute from (T, H, W, C) to (C, T, H, W) and add batch dimension (1, C, T, H, W)
    tensor = tensor.permute(3, 0, 1, 2).unsqueeze(0).to(device)

    with torch.no_grad():
        outputs = model(tensor)
        probs = F.softmax(outputs, dim=1)
        confidence, pred_idx = torch.max(probs, dim=1)

    predicted_label = LABEL_NAMES[pred_idx.item()].lower()
    return predicted_label, round(float(confidence.item()), 4)


# --- 5. Background Pipeline Worker ---
def process_single_incident(incident_id: str, file_path: str = "", video_url: str = ""):
    """Downloads video, runs R3D-18, blurs faces, updates storage, and writes to ai_analysis."""
    try:
        existing = supabase.table("ai_analysis").select("id").eq("incident_id", incident_id).execute()
        if existing.data:
            print(f"[SKIP] Incident {incident_id} is already classified.")
            return

        if not video_url and file_path:
            signed_res = supabase.storage.from_("incident-videos").create_signed_url(file_path, 900)
            if isinstance(signed_res, dict) and "signedUrl" in signed_res:
                video_url = signed_res["signedUrl"]
            elif isinstance(signed_res, dict) and "signedURL" in signed_res:
                video_url = signed_res["signedURL"]
            else:
                raise ValueError(f"Could not generate signed URL for path: {file_path}")

        if not video_url:
            raise ValueError(f"No video URL or file path provided for incident {incident_id}")

        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as raw_video, \
             tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as blurred_video:

            urllib.request.urlretrieve(video_url, raw_video.name)

            detected_type, confidence = run_model_inference(raw_video.name)

            if file_path:
                print(f"[PRIVACY] Blurring faces in {file_path}...")
                anonymize_video_file(raw_video.name, blurred_video.name)

                with open(blurred_video.name, "rb") as f:
                    supabase.storage.from_("incident-videos").upload(
                        path=file_path,
                        file=f,
                        file_options={"content-type": "video/mp4", "upsert": "true"}
                    )
                print(f"[PRIVACY] Uploaded anonymized video to incident-videos/{file_path}")

        analysis_record = {
            "incident_id": incident_id,
            "model_version": MODEL_VERSION,
            "service_type": detected_type,
            "detected_service_type": detected_type,
            "confidence_score": confidence,
            "analysis_timestamp": datetime.now(timezone.utc).isoformat(),
        }

        supabase.table("ai_analysis").insert(analysis_record).execute()
        print(f"[SUCCESS] Incident {incident_id} -> {detected_type} ({confidence})")

    except Exception as e:
        print(f"[ERROR] Failed processing incident {incident_id}: {str(e)}")


def process_all_unclassified_videos():
    try:
        analyzed_resp = supabase.table("ai_analysis").select("incident_id").execute()
        analyzed_ids = {row["incident_id"] for row in analyzed_resp.data if row.get("incident_id")}

        files = supabase.storage.from_("incident-videos").list(limit=100)

        for file_obj in files:
            file_name = file_obj.get("name")
            if not file_name or file_name.startswith("."):
                continue

            incident_id = os.path.splitext(file_name)[0]
            if incident_id not in analyzed_ids:
                print(f"[QUEUE] Processing unanalyzed video: {file_name}")
                process_single_incident(incident_id=incident_id, file_path=file_name)

    except Exception as e:
        print(f"[ERROR] Batch classification scan failed: {str(e)}")


@app.get("/")
def health_check():
    return {"status": "ok", "message": "Emergency Classifier & Face Anonymizer API is active"}


@app.post("/classify-emergency", status_code=202)
async def classify_emergency(
    payload: VideoPayload,
    background_tasks: BackgroundTasks,
    authorization: str = Header(None)
):
    if HF_WEBHOOK_SECRET and authorization != f"Bearer {HF_WEBHOOK_SECRET}":
        raise HTTPException(status_code=401, detail="Unauthorized")

    background_tasks.add_task(
        process_single_incident,
        incident_id=payload.incident_id,
        file_path=payload.file_path,
        video_url=payload.video_url
    )
    return {"message": "Job queued for classification and face blurring", "incident_id": payload.incident_id}


@app.post("/process-unclassified", status_code=202)
async def trigger_unclassified_batch(
    background_tasks: BackgroundTasks,
    authorization: str = Header(None)
):
    if HF_WEBHOOK_SECRET and authorization != f"Bearer {HF_WEBHOOK_SECRET}":
        raise HTTPException(status_code=401, detail="Unauthorized")

    background_tasks.add_task(process_all_unclassified_videos)
    return {"message": "Batch scan for unclassified videos started in background"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7860)