import librosa
import librosa.display
import matplotlib.pyplot as plt
import numpy as np
import os

def generate_stego_spectrograms(cover_path, stego_path, output_filename="stego_analysis.png"):
    print("Loading audio files...")
    # Load audio natively (preserve original sample rate)
    cover, sr = librosa.load(cover_path, sr=None)
    stego, _ = librosa.load(stego_path, sr=sr)

    # Ensure arrays are exactly the same length to prevent subtraction errors
    min_len = min(len(cover), len(stego))
    cover = cover[:min_len]
    stego = stego[:min_len]

    # 1. Isolate the steganographic payload (The Residual)
    # By subtracting the cover from the stego, all normal audio cancels out to 0.
    # The only thing left is the noise/data injected by the neural network.
    residual = stego - cover

    # 2. Compute Short-Time Fourier Transforms (STFT)
    print("Computing STFT matrices...")
    n_fft = 2048
    hop_length = 512

    D_cover = librosa.stft(cover, n_fft=n_fft, hop_length=hop_length)
    D_stego = librosa.stft(stego, n_fft=n_fft, hop_length=hop_length)
    D_residual = librosa.stft(residual, n_fft=n_fft, hop_length=hop_length)

    # 3. Convert magnitude to decibel (dB) scale for human visualization
    DB_cover = librosa.amplitude_to_db(np.abs(D_cover), ref=np.max)
    DB_stego = librosa.amplitude_to_db(np.abs(D_stego), ref=np.max)
    
    # For the residual, we don't normalize to the cover's max, we want to see its raw power
    DB_residual = librosa.amplitude_to_db(np.abs(D_residual), ref=np.max)

    # 4. Render the Matplotlib Figure
    print("Plotting visual matrices...")
    fig, axes = plt.subplots(1, 3, figsize=(20, 6), sharey=True)

    # Cover Plot
    librosa.display.specshow(DB_cover, sr=sr, hop_length=hop_length, x_axis='time', y_axis='hz', ax=axes[0], cmap='magma')
    axes[0].set_title('Original Cover Audio', fontsize=14, pad=10)
    axes[0].set_xlabel('Time')
    axes[0].set_ylabel('Frequency (Hz)')

    # Stego Plot
    librosa.display.specshow(DB_stego, sr=sr, hop_length=hop_length, x_axis='time', y_axis='hz', ax=axes[1], cmap='magma')
    axes[1].set_title('Stego Audio (With Payload)', fontsize=14, pad=10)
    axes[1].set_xlabel('Time')

    # Residual Plot (Use a different color map like 'inferno' or 'viridis' to make the data pop)
    img = librosa.display.specshow(DB_residual, sr=sr, hop_length=hop_length, x_axis='time', y_axis='hz', ax=axes[2], cmap='inferno')
    axes[2].set_title('Residual Difference (Isolated Payload)', fontsize=14, pad=10, color='red')
    axes[2].set_xlabel('Time')

    # Add a shared colorbar
    fig.colorbar(img, ax=axes, format="%+2.0f dB", label='Power (dB)')
    
    plt.tight_layout()
    
    # Save or show
    plt.savefig(output_filename, dpi=150, bbox_inches='tight')
    print(f"Analysis saved to {output_filename}")
    plt.close()

# Example Usage:
# generate_stego_spectrograms("clean_voice.wav", "encoded_voice.wav")