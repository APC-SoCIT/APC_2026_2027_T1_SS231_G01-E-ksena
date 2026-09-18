import os
import sys
import subprocess
import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import gradio as gr
from supabase import create_client, Client

# =======================================================
# 1. SUPABASE INITIALIZATION
# =======================================================
raw_url = os.environ.get("supabase_url") or os.environ.get("SUPABASE_URL", "")
raw_key = os.environ.get("supabase_key") or os.environ.get("SUPABASE_KEY", "")

SUPABASE_URL = raw_url.strip().strip("'\"").rstrip("/")
SUPABASE_KEY = raw_key.strip().strip("'\"")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Missing supabase_url or supabase_key in Space Secrets.", file=sys.stderr)
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
BUCKET_NAME = "incident-videos"

# =======================================================
# 2. MODEL ARCHITECTURE & SETTINGS (EXACT MATCH TO LOCAL)
# =======================================================
IMG_SIZE = (112, 112)
NUM_FRAMES = 16
LABEL_NAMES = ['Fire', 'Police', 'Medical']
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

if not os.path.exists(WEIGHTS_PATH):
    raise FileNotFoundError(f"'{WEIGHTS_PATH}' not found in root directory.")

model = EmergencyModel().to(device)
checkpoint = torch.load(WEIGHTS_PATH, map_location=device)

# Safely extract state_dict whether it's wrapped or raw
if isinstance(checkpoint, dict) and "state_dict" in checkpoint:
    state_dict = checkpoint["state_dict"]
elif isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
    state_dict = checkpoint["model_state_dict"]
else:
    state_dict = checkpoint

model.load_state_dict(state_dict)
model.eval()

# =======================================================
# 3. STORAGE UTILITIES (FETCH & DOWNLOAD)
# =======================================================
def get_bucket_video_choices():
    try:
        response = supabase.storage.from_(BUCKET_NAME).list()
        valid_exts = (".mp4", ".avi", ".mov", ".mkv")
        files = [
            item["name"] for item in response 
            if item.get("name") and item["name"].lower().endswith(valid_exts)
        ]
        return files
    except Exception as e:
        print(f"Error fetching bucket files: {e}")
        return []

def download_video_from_supabase(file_name: str, local_dest: str = "temp_input.mp4"):
    with open(local_dest, "wb+") as f:
        res = supabase.storage.from_(BUCKET_NAME).download(file_name)
        f.write(res)
    return local_dest

# =======================================================
# 4. INFERENCE PIPELINE (MATCHES LOCAL PRE-PROCESSING)
# =======================================================
def process_supabase_video(selected_file, confidence_threshold):
    if not selected_file:
        return None, "⚠️ Please select a video from the bucket."

    local_input = f"downloaded_{selected_file}"
    try:
        download_video_from_supabase(selected_file, local_input)
    except Exception as e:
        return None, f"❌ Failed to download '{selected_file}': {e}"

    cap = cv2.VideoCapture(local_input)
    if not cap.isOpened():
        return None, "❌ Error: Could not read downloaded video."

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = int(cap.get(cv2.CAP_PROP_FPS)) or 30
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    # Sample exactly 16 evenly spaced frames (identical to local)
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

    # Shape: (1, 3, 16, 112, 112) with simple / 255.0 normalization
    input_tensor = torch.from_numpy(np.array(frames)).float() / 255.0
    input_tensor = input_tensor.permute(3, 0, 1, 2).unsqueeze(0).to(device)

    with torch.no_grad():
        outputs = model(input_tensor)
        probabilities = F.softmax(outputs, dim=1)
        confidence, predicted = torch.max(probabilities, 1)

    conf_val = confidence.item()
    pred_idx = predicted.item()
    label = LABEL_NAMES[pred_idx]

    # Format report
    if conf_val >= confidence_threshold:
        banner_text = f"{label} ({conf_val * 100:.1f}%)"
        color = (0, 0, 255)
        report = (
            f"### 🚨 Incident Detected\n\n"
            f"- **Type:** `{label}`\n"
            f"- **Confidence:** `{conf_val * 100:.2f}%`"
        )
    else:
        banner_text = f"Low Confidence: {label} ({conf_val * 100:.1f}%)"
        color = (0, 255, 0)
        report = (
            f"### ✅ No High-Confidence Alert\n\n"
            f"- Highest guess: `{label}` ({conf_val * 100:.2f}%)\n"
            f"- Below threshold of `{confidence_threshold * 100:.1f}%`"
        )

    # Render stamped video for UI playback
    raw_output_path = "temp_raw_output.mp4"
    final_output_path = "output_browser_ready.mp4"

    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(raw_output_path, fourcc, fps, (width, height))

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        cv2.putText(frame, banner_text, (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.9, color, 2, cv2.LINE_AA)
        out.write(frame)

    cap.release()
    out.release()

    ffmpeg_cmd = [
        "ffmpeg", "-y",
        "-i", raw_output_path,
        "-vcodec", "libx264",
        "-pix_fmt", "yuv420p",
        "-crf", "23",
        final_output_path
    ]
    try:
        subprocess.run(ffmpeg_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        export_path = final_output_path
    except Exception:
        export_path = raw_output_path

    return export_path, report

# =======================================================
# 5. GRADIO UI
# =======================================================
def refresh_file_list():
    files = get_bucket_video_choices()
    return gr.Dropdown(choices=files, value=files[0] if files else None)

with gr.Blocks(theme=gr.themes.Soft(primary_hue="red")) as demo:
    gr.Markdown(f"# 🚨 Incident Analyzer — Supabase Bucket: `{BUCKET_NAME}`")
    
    with gr.Row():
        with gr.Column():
            video_dropdown = gr.Dropdown(
                label="Select Video from Bucket",
                choices=get_bucket_video_choices(),
                interactive=True
            )
            refresh_btn = gr.Button("🔄 Refresh Bucket Files", size="sm")
            conf_slider = gr.Slider(0.1, 1.0, value=0.5, step=0.05, label="Confidence Threshold")
            analyze_btn = gr.Button("Fetch & Analyze Video", variant="primary")
            
        with gr.Column():
            video_out = gr.Video(label="Annotated Output Video")
            report_out = gr.Markdown(label="Detection Summary")

    refresh_btn.click(fn=refresh_file_list, inputs=[], outputs=[video_dropdown])
    
    analyze_btn.click(
        fn=process_supabase_video,
        inputs=[video_dropdown, conf_slider],
        outputs=[video_out, report_out]
    )

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860)