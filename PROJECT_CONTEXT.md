# Aura V2-R: Audio Steganography System - Project Context

**Version:** 1.0  
**Project Type:** Covert Communication via Audio Steganography

---

## Project Overview

**Purpose:** Hide text messages in audio files using spectral domain embedding with neural network decoding for robustness against transmission impairments.

**Key Features:**
- Deterministic spectral encoding (no neural encoder)
- Neural network decoder (CNN for nibble classification)
- Multi-segment transmission with parity reconstruction
- Hamming(8,4) error correction
- Real-time analysis dashboard
- WebSocket-based chat integration

**Target Users:** Security researchers, journalists, privacy advocates, academic researchers.

---

## System Architecture

```
Frontend (React) → Backend (Flask) → Services → Model Scripts → Storage
```

**Frontend:** React 19 + TypeScript + Vite, screens for Encode/Reveal/Analysis/Chat  
**Backend:** Flask with blueprints (auth, chat, file, aura), service layer  
**Model:** PyTorch CNN decoder (AuraV2RDecoder)  
**Storage:** SQLite database + WAV files in outputs/uploads/carrier_bank

---

## Folder Structure

```
Aura/
├── backend/
│   ├── routes/          # API blueprints
│   ├── services/        # Business logic (aura_service.py: 3000+ lines)
│   ├── aura-model-v1/   # ML model and scripts
│   ├── aura_carrier_bank/ # Pre-approved carriers
│   ├── outputs/         # Generated stego files
│   └── uploads/         # User uploads
├── frontend/
│   └── src/
│       ├── components/   # React components
│       ├── screens/      # Page components
│       └── services/     # API client
```

---

## Backend Architecture

**Flask Application Factory Pattern** (`app.py`):
- Creates app with config (database, upload folder, CORS)
- Registers 4 blueprints: auth_bp, chat_bp, file_bp, aura_bp
- Initializes SQLite database and WebSocket

**Key Routes:**
- `POST /api/encode/preview`: Calculate capacity
- `POST /api/encode`: Generate stego audio
- `POST /api/decode`: Decode audio file
- `POST /api/analysis`: Forensic analysis
- WebSocket events for real-time chat

**Services Layer:**
- `aura_service.py`: Core steganography logic (3000+ lines)
- `db.py`: SQLite connection management
- `auth_service.py`: User authentication
- `file_service.py`: File handling

---

## Frontend Architecture

**React 19 + TypeScript:**
- State management in App.tsx (user, messages, analysis)
- Client-side routing (no React Router)
- API service layer with fetch wrapper
- WebSocket integration for real-time updates
- Recharts for visualizations

**Key Components:**
- `AnalysisPageV2.tsx` (97KB): Main forensic interface
- `ForensicCards.tsx`: Recovery verdict, charts
- `EncodePage.tsx`: Text encoding interface
- `RevealPageV2.tsx`: Audio decoding interface

---

## Database Schema

**8 Tables:**
1. `users`: Authentication (username, password_hash)
2. `messages`: Chat messages (sender, receiver, content)
3. `audio_transfers`: File transfers (sender, receiver, file metadata)
4. `audio_assets`: Audio deduplication (file_hash, sample_rate, duration)
5. `transmissions`: Multi-segment tracking (transmission_id, total_parts)
6. `stego_generations`: Encoding records (cover_asset_id, stego_asset_id)
7. `transmission_parts`: Segment tracking (part_number, status)
8. `analysis_runs`/`analysis_metrics`/`chunk_analysis_metrics`: Analysis data

---

## AI Model

**AuraV2RDecoder Architecture:**
```python
class AuraV2RDecoder(nn.Module):
    def __init__(self, out_bits=4, base_ch=32):
        self.net = nn.Sequential(
            Conv2d(1, 32, 3), BatchNorm, ReLU,
            Conv2d(32, 32, 3), BatchNorm, ReLU, MaxPool2d(2),
            Conv2d(32, 64, 3), BatchNorm, ReLU,
            Conv2d(64, 64, 3), BatchNorm, ReLU, MaxPool2d(2),
            Conv2d(64, 128, 3), BatchNorm, ReLU,
            AdaptiveAvgPool2d((1, 1))
        )
        self.head = nn.Sequential(
            Flatten(),
            Linear(128, 128), ReLU,
            Linear(128, 4)  # 4 logits for nibble bits
        )
```

**Input:** Log-magnitude spectrogram (1, 257, ~250)  
**Output:** 4 logits (one per bit in nibble)  
**Loss:** BCEWithLogitsLoss (inferred)  
**Training:** Pre-trained weights loaded from `aura_v2r_decoder_only.pt`

---

## Audio Steganography

**Encoding Pipeline:**
1. Text → ASCII bytes → nibbles (4 bits per byte)
2. Generate header (24 bytes with metadata)
3. Add sync pattern [10,10,4,1,5,5,5,2,4,1,10,10]
4. Apply repeat factor (3x)
5. Convert to bit vectors
6. Select safe carrier from carrier bank
7. Chunk audio (2-second chunks)
8. STFT → log-magnitude
9. Embed in frequency bands: [750-1125, 1250-1625, 1750-2125, 2250-2625 Hz]
10. Add/subtract strength 0.1 in log-magnitude
11. ISTFT → time domain
12. Save as WAV

**Frequency Bands (from config):**
```json
"bit_bands": [[24,36], [40,52], [56,68], [72,84]]
```

**Why spectral embedding:** Less perceptible than time-domain, robust to common operations, preserves phase for quality.

---

## Decoding

**Decoding Pipeline:**
1. Load audio (NO peak normalization)
2. Time-domain alignment search (find sync pattern)
3. Chunk audio (2-second chunks)
4. STFT → log-magnitude
5. Neural network prediction per chunk
6. Majority voting (3x repeat)
7. Hamming(8,4) ECC decoding (if enabled)
8. CRC16 verification
9. Post-processing dictionary correction
10. Return recovered text

**Alignment Algorithm:**
- Search offset every 0.1 seconds
- Test shifts -2 to +2 chunks
- Minimize BER against sync pattern
- Early exit on perfect match

**Majority Voting:**
- Each nibble encoded 3 times
- Vote on each of 4 bits independently
- Reduces random bit errors

---

## Audio Processing

**STFT Parameters:**
- n_fft: 512 (32ms resolution)
- hop_length: 128 (75% overlap)
- win_length: 512
- window: Hanning
- Output: 257 frequency bins, ~250 time frames

**Log-Magnitude:**
- `log(1 + magnitude)` for numerical stability
- Compresses 80dB dynamic range to 0-1
- Normalized for visualization

**Phase Preservation:**
- Phase extracted during STFT
- Discarded for decoder input (not needed for bit detection)
- Preserved during ISTFT for audio quality

---

## Error Handling

**CRC16:**
- Polynomial: 0xA001
- Verifies payload integrity
- Detects most transmission errors

**Hamming(8,4) ECC:**
- Input: 4 bits → Output: 8 bits
- Corrects single-bit errors
- Detects double-bit errors
- 2x overhead

**Header Correction:**
- Single-bit flip correction (192-bit search space)
- Checksum verification
- Fails if uncorrectable

**Post-Processing:**
- Dictionary-based correction (common words)
- Fixes semantic bit-flip artifacts
- Conservative approach (only suspicious tokens)

---

## Analysis Dashboard

**Visualizations:**
1. **Recovery Verdict Card:** Status, confidence, integrity score
2. **Recovered Message Card:** Text with copy button
3. **Chunk Confidence Chart:** Bar chart per chunk
4. **Sequence Progress Chart:** Multi-segment status
5. **SNR by Chunk Chart:** Signal quality over time
6. **Correction Impact Chart:** Where ECC/post-processing applied
7. **Signal Timeline:** Waveform and spectrogram
8. **Chunk Diagnostics Table:** Per-chunk metrics

**Metrics:**
- Confidence: Derived from SNR and MSE
- SNR: Signal-to-noise ratio in dB
- MSE: Mean squared error
- Integrity Score: Weighted combination of metrics

---

## Technical Decisions

**Deterministic Encoder + Neural Decoder:**
- Encoder: Reproducible, simple
- Decoder: Robust to distortions
- Training: Only train decoder

**Frequency Band Embedding:**
- 4 bands in speech range (750-2625 Hz)
- Less perceptible, good SNR
- Fixed bands (not adaptive)

**Repeat Factor 3:**
- Majority voting requires odd number
- Good error correction
- 3x capacity overhead acceptable

**Carrier Bank Approach:**
- Pre-approved carriers only
- Validated for reliability
- Prevents user errors

**SQLite Database:**
- Simple, portable
- Sufficient for demo scale
- No separate server needed

---

## Limitations

1. ASCII only (no Unicode)
2. Limited to 6 pre-approved carriers
3. ~5 chars/minute capacity
4. Not real-time (10-30s processing)
5. Mono audio only (16kHz fixed)
6. Training pipeline not included
7. Hamming(8,4) doubles payload size
8. No streaming/progressive decoding

---

## Future Improvements

**Short-term:**
- Unicode/UTF-8 support
- Custom carrier upload
- Adaptive embedding strength
- Progressive decoding
- Training pipeline inclusion

**Medium-term:**
- Stereo support (double capacity)
- Variable sample rates
- Advanced ECC (Reed-Solomon)
- GPU acceleration
- React Native mobile app

**Long-term:**
- End-to-end training (encoder + decoder)
- Deep learning encoder
- Adversarial robustness training
- Multi-modal steganography
- Production deployment (PostgreSQL, Redis)

---

## Viva Preparation

### Key Questions

**Q1: Why hybrid deterministic/neural approach?**
A: Deterministic encoding ensures reproducibility; neural decoding provides robustness against distortions. Reduces training complexity.

**Q2: Explain STFT parameters.**
A: n_fft=512 (32ms freq resolution), hop=128 (75% overlap), Hanning window. Balances frequency-time precision.

**Q3: Why no peak normalization in decoder?**
A: Would scale embedded signal, reducing accuracy. Decoder trained on non-normalized audio.

**Q4: How does majority voting work?**
A: Each nibble encoded 3 times. Vote on each bit independently. Reduces random errors.

**Q5: Explain Hamming(8,4) ECC.**
A: 4 bits → 8 bits with parity. Corrects single-bit errors, detects double-bit. 2x overhead.

**Q6: Why these frequency bands?**
A: Speech range, less perceptible, good SNR. Avoids extremes (rumble/hiss).

**Q7: How does alignment work?**
A: Search for sync pattern in time domain. Test offsets and shifts. Minimize BER.

**Q8: Why log-magnitude?**
A: Compresses 80dB range, matches perception, normalizes for neural network.

**Q9: Explain header structure.**
A: 24 bytes: magic, version, transmission ID, segment info, payload length, CRC, ECC, timestamp.

**Q10: What does the decoder output?**
A: 4 logits per chunk → sigmoid → bits → nibble. One nibble per 2-second chunk.

---

## README

```markdown
# Aura V2-R

Audio steganography system for covert communication.

## Setup

Backend:
```bash
cd backend
pip install -r requirements.txt
python app.py
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

## Features

- Hide text in audio using spectral embedding
- Neural network decoding for robustness
- Multi-segment transmission
- Real-time analysis dashboard
- WebSocket chat integration

## Usage

1. Encode: Enter text, generate stego audio
2. Transmit: Download or send via chat
3. Decode: Upload audio, recover message
4. Analyze: View forensic metrics

## Tech Stack

- Backend: Flask, PyTorch, SQLite
- Frontend: React, TypeScript, Vite
- ML: CNN decoder, STFT processing
```

---

## Developer Documentation

### Adding a New Carrier

1. Place WAV file in `backend/aura_carrier_bank/`
2. Update `APPROVED_SAFE_CARRIERS` in `aura_v2r_sender.py`
3. Run validation: `python aura_v2r_carrier_bank_tester.py`
4. Update `carrier_bank_info.json`

### Modifying Embedding Strength

Edit `embed_strength` in `aura_v2r_config.json`:
```json
{
  "embed_strength": 0.1,
  "embed_strength_val": 0.1
}
```

### Adding New ECC Scheme

1. Implement encode/decode functions in `aura_v2r_sender.py`
2. Update `ecc_scheme` parameter in header
3. Add scheme to `decode_payload_ecc()` in receiver

### Extending Analysis Dashboard

Add new chart in `frontend/src/components/analysis/`:
1. Create component extending Recharts
2. Add data generation in `aura_service.py`
3. Include in `AnalysisPageV2.tsx`

---

## Code Walkthrough

### Encoding Flow

1. User enters text in `EncodePage.tsx`
2. Frontend calls `POST /api/encode/preview`
3. `aura_routes.py` → `aura_service.py::capacity_for_text()`
4. `build_encode_transmission_plan()` calculates requirements
5. User confirms, calls `POST /api/encode`
6. `encode_text()` selects carrier, invokes sender script
7. `aura_v2r_sender.py`:
   - Loads carrier, chunks audio
   - Encodes text to nibbles with header
   - Applies spectral embedding
   - Saves stego WAV
8. Returns audio URL to frontend
9. User downloads or sends to chat

### Decoding Flow

1. User uploads audio in `RevealPageV2.tsx`
2. Frontend calls `POST /api/decode`
3. `aura_routes.py` saves file, calls `decode_audio_path()`
4. `aura_service.py` invokes receiver script via subprocess
5. `aura_v2r_receiver.py`:
   - Loads neural network
   - Performs time-domain alignment
   - Decodes chunks with CNN
   - Applies majority voting
   - Decodes ECC
   - Verifies CRC
   - Post-processes text
6. Returns recovered text to frontend
7. Frontend displays with confidence metrics

### Analysis Flow

1. User selects audio in `AnalysisPageV2.tsx`
2. Frontend calls `POST /api/analysis`
3. `analyze_message()` resolves audio paths
4. Loads cover/stego from database
5. Generates spectrograms and waveforms
6. Computes chunk metrics (SNR, MSE, confidence)
7. Builds forensic artifacts (SVG)
8. Returns comprehensive payload
9. Frontend renders charts and tables

---

**End of Project Context Document**
