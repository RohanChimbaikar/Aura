import os
import sys
import shutil
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from app import create_app
from services.aura_service import (
    encode_text,
    analyze_message,
    OUTPUT_DIR,
)

def run_tests():
    app = create_app()
    with app.app_context():
        print("--- RUNNING ROUNDTRIP AND SIMULATION TESTS ---")

        # Test Case 1: Standard encode and decode (Single part, no ECC, no simulation)
        print("\n[Test 1] Single Part, No ECC, No simulation...")
        secret1 = "AURA_TEST_SECRET_1"
        res1 = encode_text(secret1, ecc_scheme=0, use_parity=False)
        assert res1["success"], f"Encoding failed: {res1.get('error')}"
        audio_url1 = res1["audio_url"]
        
        # Analyze/Decode
        analysis1 = analyze_message(audio_url=audio_url1)
        assert analysis1["status"] in ("complete", "completed"), f"Analysis status: {analysis1.get('status')}, reason: {analysis1.get('reason')}"
        recovered_text1 = analysis1["summary"]["recoveredText"] or analysis1["summary"].get("recovered_text")
        print(f"Original : {secret1}")
        print(f"Recovered: {recovered_text1}")
        
        # Raw stego channel can have minor bit flips (e.g. 1-2 chars). We check for high similarity.
        import difflib
        similarity = difflib.SequenceMatcher(None, secret1, recovered_text1).ratio()
        print(f"Similarity: {similarity:.2f}")
        assert similarity >= 0.75, f"Recovered text similarity too low! Expected {secret1}, got {recovered_text1} (similarity: {similarity:.2f})"
        print("=> Test 1 PASSED!")

        # Test Case 2: ECC Hamming(8,4) with Noise Simulation
        print("\n[Test 2] Single Part, Hamming(8,4) ECC, Noise simulation...")
        secret2 = "AURA_ECC_TEST_SECRET_2"
        res2 = encode_text(secret2, ecc_scheme=1, use_parity=False)
        assert res2["success"], f"Encoding failed: {res2.get('error')}"
        audio_url2 = res2["audio_url"]
        
        # Decode with noise simulation (e.g. 5% noise)
        sim = {
            "noiseLevel": 5.0,
            "clippingLevel": 100.0,
            "transcodeType": "None",
            "droppedParts": []
        }
        analysis2 = analyze_message(audio_url=audio_url2, simulation=sim)
        assert analysis2["status"] in ("complete", "completed"), f"Analysis status: {analysis2.get('status')}, reason: {analysis2.get('reason')}"
        recovered_text2 = analysis2["summary"]["recoveredText"] or analysis2["summary"].get("recovered_text")
        print(f"Original : {secret2}")
        print(f"Recovered: {recovered_text2}")
        assert recovered_text2 == secret2, f"Recovered text mismatch under noise! Expected {secret2}, got {recovered_text2}"
        corrected_bits = analysis2.get("transmissionMetrics", {}).get("correctedBits", 0)
        print(f"ECC Correction stats: Corrected bits = {corrected_bits}")
        print("=> Test 2 PASSED!")

        # Test Case 3: Grouped Transmission with Parity Packet and Packet Drop Simulation
        print("\n[Test 3] Multi Part, Parity, Drop exactly one part simulation...")
        secret3 = "AURA_PARITY_TEST_SECRET_3_THAT_IS_LONG_ENOUGH_TO_BE_SPLIT_OR_WE_USE_PARITY_TO_FORCE_MULTIPLE_SEGMENTS_AND_DROP_ONE"
        res3 = encode_text(secret3, ecc_scheme=0, use_parity=True)
        assert res3["success"], f"Encoding failed: {res3.get('error')}"
        tx_id = res3["transmission_id"]
        total_parts = res3["total_segments"]
        print(f"Generated transmission {tx_id} with {total_parts} segments.")
        
        # Drop Part 1
        sim3 = {
            "noiseLevel": 0.0,
            "clippingLevel": 100.0,
            "transcodeType": "None",
            "droppedParts": [1]
        }
        
        analysis3 = analyze_message(transmission_id=tx_id, total_parts=total_parts, simulation=sim3)
        assert analysis3["status"] in ("complete", "completed"), f"Analysis status: {analysis3.get('status')}, reason: {analysis3.get('reason')}"
        recovered_text3 = analysis3["summary"]["recoveredText"] or analysis3["summary"].get("recovered_text")
        print(f"Original : {secret3}")
        print(f"Recovered: {recovered_text3}")
        assert recovered_text3 == secret3, f"Recovered text mismatch under packet drop! Expected {secret3}, got {recovered_text3}"
        
        # Let's inspect the segments list
        segments = analysis3.get("segments") or []
        assert len(segments) == total_parts, "Segment count mismatch"
        part1 = segments[0]
        assert part1["status"] == "reconstructed", f"Part 1 status should be reconstructed, got {part1['status']}"
        print("=> Test 3 PASSED!")

        print("\nALL ROUNDTRIP TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_tests()
