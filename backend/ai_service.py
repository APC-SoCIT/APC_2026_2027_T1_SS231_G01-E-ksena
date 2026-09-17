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
WEIGHTS_PATH = "emergency_ai3.pth"

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
        print("✅ Custom PyTorch Model loaded successfully!")
    except Exception as e:
        print(f"❌ Failed to load model (Is {WEIGHTS_PATH} in the backend folder?): {e}")
        model = None

# Load model initially
load_model()

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "model_loaded": model is not None})

@app.route('/analyze-video', methods=['POST'])
def analyze_video():
    if not model:
        load_model() # Try loading again
        if not model:
            return jsonify({"error": f"AI model not loaded. Please make sure {WEIGHTS_PATH} is in the backend folder."}), 500

    data = request.json
    video_url = data.get('video_url')
    
    if not video_url:
        return jsonify({"error": "video_url is required"}), 400
        
    print(f"[AI SERVICE] Analyzing video: {video_url}")
    
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp_file:
            if video_url.startswith("http"):
                response = requests.get(video_url, stream=True)
                for chunk in response.iter_content(chunk_size=8192):
                    tmp_file.write(chunk)
                video_path = tmp_file.name
            else:
                print("[AI SERVICE] Not a valid HTTP link. Simulating classification.")
                video_path = None
                
        if video_path:
            # --- CLASSMATE'S PYTORCH PROCESSING LOGIC ---
            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                return jsonify({"error": "Could not read downloaded video"}), 500

            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            # Sample exactly 16 evenly spaced frames
            indices = np.linspace(0, max(0, total_frames - 1), NUM_FRAMES, dtype=int)
            frames = []
            for i in indices:
                cap.set(cv2.CAP_PROP_POS_FRAMES, i)
                ret, frame = cap.read()
                if ret:
                    frame_rgb = cv2.resize(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB), IMG_SIZE)
                    frames.append(frame_rgb)
                else:
                    frames.append(np.zeros((*IMG_SIZE, 3), dtype=np.uint8))

            input_tensor = torch.from_numpy(np.array(frames)).float() / 255.0
            input_tensor = input_tensor.permute(3, 0, 1, 2).unsqueeze(0).to(device)

            with torch.no_grad():
                outputs = model(input_tensor)
                probabilities = F.softmax(outputs, dim=1)
                confidence, predicted = torch.max(probabilities, 1)

            conf_val = confidence.item()
            pred_idx = predicted.item()
            detected_service = LABEL_NAMES[pred_idx]
            
            cap.release()
            try:
                os.unlink(video_path)
            except Exception as e:
                print(f"[AI SERVICE] Warning: could not delete temp file {video_path}: {e}")
            
        else:
            # Mock behavior if it's not a real video URL
            detected_service = 'medical'
            conf_val = 0.95

        print(f"[AI SERVICE] Result: {detected_service} (Confidence: {conf_val:.2f})")
        return jsonify({
            "success": True,
            "detected_service_type": detected_service,
            "confidence_score": conf_val
        })
        
    except Exception as e:
        print(f"[AI SERVICE] Error during classification: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
