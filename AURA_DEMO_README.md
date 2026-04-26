# Aura V2-R Demo Integration

## Frontend to Backend Flow

The React/Vite frontend calls the existing Flask backend under `/api`.

- `POST /api/encode/preview` returns capacity, required chunks, required duration, and selected safe carrier metadata.
- `POST /api/encode` invokes the existing Aura sender script and returns a generated stego WAV in `backend/outputs/`.
- `POST /api/decode` invokes the existing Aura receiver script for a generated WAV reference or uploaded WAV file.
- `GET /api/messages` and `POST /api/messages` provide a small local demo chat history.
- `GET /api/messages/:id/analysis` returns merged encode/decode metadata for the selected stego audio.

## Sender / Receiver Invocation

The backend wrapper in `backend/services/aura_service.py` preserves the existing model scripts and calls them with subprocess:

- Sender: `backend/aura-model-v1/aura_v2r_sender.py`
- Receiver: `backend/aura-model-v1/aura_v2r_receiver.py`
- Config: `backend/aura-model-v1/aura_v2r_config.json`
- Decoder checkpoint: `backend/aura-model-v1/aura_v2r_decoder_only.pt`

The model folder is not moved, renamed, or replaced.

## Output Storage

Generated stego WAV files are stored in:

```text
backend/outputs/
```

Uploaded decode WAV files are stored in:

```text
backend/uploads/
```

Demo message and analysis records are stored as local JSON under:

```text
backend/instance/
```

## Chat to Reveal to Analysis

1. Encode creates a stego WAV using Dynamic Safe Mode.
2. Send to Chat creates an outgoing secure audio message in app state and the local backend message store.
3. Reveal Hidden Message opens the Reveal screen with that audio preloaded and decodes via the existing receiver script.
4. Open in Analysis loads merged signal, payload, encode, decode, and recovery metadata for the selected audio.

## Run Locally

Backend:

```powershell
cd C:\Aura\backend
pip install -r requirements.txt
python app.py
```

Frontend:

```powershell
cd C:\Aura\frontend
npm install
npm run dev
```

Open the Vite URL, usually:

```text
http://localhost:5173
```
