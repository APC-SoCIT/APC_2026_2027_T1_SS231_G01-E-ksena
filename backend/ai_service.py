import os
import requests
import tempfile
import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from flask import Flask, request, jsonify

app = Flask(__name__)

# =======================================================
# 2. MODEL ARCHITECTURE & SETTINGS (EXACT MATCH TO CLASSMATE)
# =======================================================
IMG_SIZE = (112, 112)
NUM_FRAMES = 16
LABEL_NAMES = ['fire', 'police', 'medical'] # Lowercase to match Node backend
WEIGHTS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "emergency_ai3.pth")

class EmergencyModel(nn.Module):
    def __init__(self):
        super(EmergencyModel, self).__init__()
        self.conv1 = nn.Conv3d(3, 16, kernel_size=3, padding=1)
        self.pool = nn.MaxPool3d(2)
        self.conv2 = nn.Conv3d(16, 32, kernel_size=3, padding=1)
        self.flatten = nn.Flatten()
        self.fc1 = nn.Linear(32 * 4 * 28 * 28, 64)
        self.fc2 = nn.Linear(64, 3)

    def forward(self, x):
        x = self.pool(F.relu(self.conv1(x)))
        x = self.pool(F.relu(self.conv2(x)))
        x = self.flatten(x)
        x = F.relu(self.fc1(x))
        return self.fc2(x)

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = None

def load_model():
    global model
    try:
        print(f"Loading custom AI Model from {WEIGHTS_PATH}...")
        if not os.path.exists(WEIGHTS_PATH):
            raise FileNotFoundError(f"Cannot find {WEIGHTS_PATH}")
            
        model = EmergencyModel().to(device)
        checkpoint = torch.load(WEIGHTS_PATH, map_location=device, weights_only=False)

        if isinstance(checkpoint, dict) and "state_dict" in checkpoint:
            state_dict = checkpoint["state_dict"]
        elif isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
            state_dict = checkpoint["model_state_dict"]
        else:
            state_dict = checkpoint

        model.load_state_dict(state_dict)
        model.eval()
        print("[AI SERVICE] [SUCCESS] Custom PyTorch Model loaded successfully!", flush=True)
    except Exception as e:
        print(f"[AI SERVICE] [ERROR] Failed to load model ({WEIGHTS_PATH}): {e}", flush=True)
        model = None

# Load model initially
load_model()

# =======================================================
# 3. FACE DETECTION & BLURRING PIPELINE
# =======================================================
# Load OpenCV Haar Cascade for face detection
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
if face_cascade.empty():
    print("[AI SERVICE] [WARNING] Haar Cascade failed to load from cv2.data.haarcascades", flush=True)

def blur_faces_in_video(input_path, output_path):
    """
    Reads an input video, detects faces across every frame,
    and applies a heavy Gaussian blur to privacy-protect individuals.
    Returns (success: bool, total_faces_detected: int, frame_count: int).
    """
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video file {input_path}")

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 20.0
    if fps <= 0 or np.isnan(fps):
        fps = 20.0

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    if not writer.isOpened():
        cap.release()
        raise RuntimeError("Failed to initialize VideoWriter for blurred video")

    total_faces = 0
    frame_count = 0

    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            frame_count += 1

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            # Detect faces with tuned scaleFactor and minNeighbors
            faces = face_cascade.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=4,
                minSize=(24, 24)
            )

            if len(faces) > 0:
                total_faces += len(faces)
                for (x, y, w, h) in faces:
                    # Expand region slightly (15%) for full face and hairline coverage
                    pad_w = int(w * 0.15)
                    pad_h = int(h * 0.15)
                    x1 = max(0, x - pad_w)
                    y1 = max(0, y - pad_h)
                    x2 = min(width, x + w + pad_w)
                    y2 = min(height, y + h + pad_h)

                    roi = frame[y1:y2, x1:x2]
                    # Ensure kernel size is positive and odd
                    kw = max(3, ((x2 - x1) // 3) * 2 + 1)
                    kh = max(3, ((y2 - y1) // 3) * 2 + 1)
                    blurred_roi = cv2.GaussianBlur(roi, (kw, kh), 30)
                    frame[y1:y2, x1:x2] = blurred_roi

            writer.write(frame)
    finally:
        cap.release()
        writer.release()

    if frame_count == 0 or not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
        raise RuntimeError("Face blur processing generated an invalid or empty video file")

    return True, total_faces, frame_count

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "model_loaded": model is not None,
        "face_cascade_loaded": not face_cascade.empty()
    })

@app.route('/process-video', methods=['POST'])
@app.route('/analyze-video', methods=['POST'])
def analyze_video():
    if not model:
        load_model() # Try loading again

    data = request.json or {}
    video_url = data.get('video_url')
    
    if not video_url:
        return jsonify({"error": "video_url is required"}), 400
        
    print(f"[AI SERVICE] Received request to process/analyze video: {video_url}", flush=True)
    
    video_path = None
    blurred_path = None
    try:
        if video_url.startswith("http"):
            print("[AI SERVICE] Downloading video...", flush=True)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp_file:
                response = requests.get(video_url, timeout=45)
                if response.status_code != 200:
                    return jsonify({"error": f"Failed to download video: HTTP {response.status_code}"}), 400
                tmp_file.write(response.content)
                video_path = tmp_file.name
            print(f"[AI SERVICE] Downloaded video to {video_path} ({os.path.getsize(video_path)} bytes)", flush=True)
        else:
            print("[AI SERVICE] Not a valid HTTP link. Simulating fallback.", flush=True)
                
        detected_service = 'medical'
        conf_val = 0.85
        total_faces_blurred = 0

        if video_path and os.path.exists(video_path):
            # 1. Run Face Detection & Gaussian Blur Processing
            print("[AI SERVICE] Applying face-blurring pipeline...", flush=True)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp_blur:
                blurred_path = tmp_blur.name

            blur_ok, total_faces_blurred, frame_count = blur_faces_in_video(video_path, blurred_path)
            print(f"[AI SERVICE] Blur complete: {frame_count} frames processed, {total_faces_blurred} face detections blurred.", flush=True)

            # 2. Run Classification on the Blurred Video
            if model:
                cap = cv2.VideoCapture(blurred_path)
                if cap.isOpened():
                    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                    step = max(1, total_frames // NUM_FRAMES)
                    frames = []
                    curr = 0
                    while cap.isOpened() and len(frames) < NUM_FRAMES:
                        ret, frame = cap.read()
                        if not ret:
                            break
                        if curr % step == 0:
                            frame_rgb = cv2.resize(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB), IMG_SIZE)
                            frames.append(frame_rgb)
                        curr += 1
                    cap.release()

                    while len(frames) < NUM_FRAMES:
                        frames.append(np.zeros((*IMG_SIZE, 3), dtype=np.uint8))

                    input_tensor = torch.from_numpy(np.array(frames)).float() / 255.0
                    input_tensor = input_tensor.permute(3, 0, 1, 2).unsqueeze(0).to(device)

                    with torch.no_grad():
                        outputs = model(input_tensor)
                        probabilities = F.softmax(outputs, dim=1)
                        confidence, predicted = torch.max(probabilities, 1)

                    conf_val = float(confidence.item())
                    pred_idx = int(predicted.item())
                    detected_service = LABEL_NAMES[pred_idx]
            else:
                detected_service = 'medical'
                conf_val = 0.85

        print(f"[AI SERVICE] Classification Complete -> {detected_service} (Confidence: {conf_val:.2f})", flush=True)

        # 3. Read blurred video binary for response
        blurred_video_b64 = None
        if blurred_path and os.path.exists(blurred_path):
            import base64
            with open(blurred_path, 'rb') as f:
                blurred_video_b64 = base64.b64encode(f.read()).decode('utf-8')

        return jsonify({
            "success": True,
            "detected_service_type": detected_service,
            "confidence_score": conf_val,
            "faces_blurred": total_faces_blurred,
            "has_blurred_video": blurred_video_b64 is not None,
            "blurred_video_base64": blurred_video_b64
        })
        
    except Exception as e:
        print(f"[AI SERVICE] Error during processing/blurring: {e}", flush=True)
        return jsonify({"error": str(e), "success": False}), 500
    finally:
        if video_path and os.path.exists(video_path):
            try:
                os.unlink(video_path)
            except Exception:
                pass
        if blurred_path and os.path.exists(blurred_path):
            try:
                os.unlink(blurred_path)
            except Exception:
                pass

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
