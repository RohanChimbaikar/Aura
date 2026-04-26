AURA V2-R FINAL INFERENCE BUNDLE
========================================

This bundle contains the FINAL inference-only artifacts for Aura V2-R.

FILES
-----
1. aura_v2r_sender.py
   - Deterministic sender-side spectral embedding script
   - Converts secret text into stego audio
   - NOTE: Aura V2-R does NOT use a learned encoder model.
     The sender is function-based, not neural.

2. aura_v2r_receiver.py
   - Neural CNN decoder script
   - Loads aura_v2r_decoder_only.pt
   - Decodes hidden text from stego audio using repeat-3 majority vote

3. aura_v2r_decoder_only.pt
   - Decoder-only trained weights extracted from best checkpoint

4. aura_v2r_config.json
   - Locked config for inference

MODEL SUMMARY
-------------
Best epoch       : 24
Best combined    : 0.9662249027138733

Val stats:
{
  "clean_bit": 0.9892570349107306,
  "mild_bit": 0.9779116584593991,
  "clean_nib": 0.9618473967873906,
  "mild_nib": 0.920481940565339,
  "clean_char": 0.9879518072289156,
  "mild_char": 0.9686746987951808,
  "snr_db": 26.24293609217015,
  "combined": 0.9662249027138733
}

IMPORTANT DESIGN
----------------
Aura V2-R is a HYBRID design:

SENDER:
- deterministic spectral embedding
- NOT a trained encoder model

RECEIVER:
- trained deep-learning CNN decoder
- this is the learned model that recovers the hidden nibble per chunk

PAYLOAD LOGIC
-------------
- 1 chunk = 2 sec audio
- 1 chunk carries 1 nibble (4 bits)
- 1 character = 2 nibbles
- repeat-3 protection
- therefore 1 character = 6 chunks = 12 sec
- approx reliable capacity = ~5 chars/minute

USAGE EXAMPLE
-------------

SENDER:
python aura_v2r_sender.py \
  --config aura_v2r_config.json \
  --cover input_cover.wav \
  --text "2682" \
  --out stego_2682.wav

RECEIVER:
python aura_v2r_receiver.py \
  --config aura_v2r_config.json \
  --weights aura_v2r_decoder_only.pt \
  --stego stego_2682.wav

RECOMMENDED LIVE DEMOS
----------------------
Safest live demo texts:
- 2682
- AURA
- PASS

Longer messages are possible but should be split across multiple stego files
for reliability in presentations.

END
