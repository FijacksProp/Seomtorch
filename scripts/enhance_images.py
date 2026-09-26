#!/usr/bin/env python3
"""
Production Image Enhancement Pipeline for Seomtorch Question Banks:
1. Watermark Detection & Surgical Erasure (removes 'MySchool.com.ng' overlay without breaking diagram lines).
2. Document Illumination Normalization (erases reverse bleed-through text & murky yellow/gray paper scans).
3. 2x Lanczos4 Super-Resolution Upscaling.
4. Edge-Aware Unsharp Masking.
5. Contrast Curve Normalization (Pure white background #FFFFFF, Deep dark ink #000000).
6. Automatic Safety Backup to assets/questions_raw_backup/.
"""

import os
import sys
import glob
import shutil
import argparse
import cv2
import numpy as np

def enhance_image(img):
    if img is None:
        return None, False, False
        
    h_orig, w_orig = img.shape[:2]
    b, g, r = cv2.split(img)
    diff_rg = r.astype(int) - g.astype(int)
    diff_rb = r.astype(int) - b.astype(int)
    
    # 1. Precise watermark detection (coral/pink hue)
    # The watermark has strong red with significantly attenuated green and blue
    wm_mask = (diff_rg > 14) & (diff_rb > 14) & (r > 130)
    has_watermark = bool(np.sum(wm_mask) > 75)
    
    if has_watermark:
        # In the red channel, the watermark body is ~255 (same as white background).
        base = r.copy()
        # Dilate mask by 1 pixel to catch anti-aliased border edges
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        dilated = cv2.dilate(wm_mask.astype(np.uint8), kernel)
        # Erase outline only on non-black-ink pixels (r > 105)
        base[(dilated > 0) & (r > 105)] = 255
    else:
        base = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
    # 2. Check if background is murky paper or uneven scan
    med = np.median(base)
    was_normalized = False
    if med < 220:
        was_normalized = True
        # Morphological background division to eliminate paper discoloration and reverse bleed-through
        k_size = min(35, max(15, (min(h_orig, w_orig) // 8) | 1))
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (k_size, k_size))
        bg = cv2.morphologyEx(base, cv2.MORPH_CLOSE, kernel)
        norm = cv2.divide(base, bg, scale=255)
        
        # Adaptive contrast stretching for faded ink
        p2 = np.percentile(norm, 1.5)
        if p2 > 50:
            norm = np.clip((norm.astype(float) - p2) / (240.0 - p2) * 255.0, 0, 255).astype(np.uint8)
        base = norm
        
    # 3. High-definition 2x upscale using Lanczos4 interpolation
    upscaled = cv2.resize(base, (w_orig * 2, h_orig * 2), interpolation=cv2.INTER_LANCZOS4)
    
    # 4. Sharpening filter (Unsharp masking)
    gaussian = cv2.GaussianBlur(upscaled, (0, 0), 1.0)
    sharpened = cv2.addWeighted(upscaled, 1.25, gaussian, -0.25, 0)
    
    # 5. Dynamic tone curve: pure white background (> 220), deep dark ink (< 60)
    lut = np.zeros(256, dtype=np.uint8)
    for i in range(256):
        if i >= 220:
            lut[i] = 255
        elif i <= 60:
            lut[i] = 0
        else:
            lut[i] = int((i - 60) / (220 - 60) * 255)
            
    res = cv2.LUT(sharpened, lut)
    
    # Convert back to BGR for saving
    return cv2.cvtColor(res, cv2.COLOR_GRAY2BGR), has_watermark, was_normalized

def process_subject(subject_dir, backup_dir):
    if not os.path.exists(subject_dir):
        print(f"Error: Directory not found: {subject_dir}")
        return
        
    os.makedirs(backup_dir, exist_ok=True)
    files = sorted(glob.glob(os.path.join(subject_dir, "*.*")))
    total = len(files)
    print(f"\nProcessing {total} images in {subject_dir}...")
    print(f"Safety backup directory: {backup_dir}")
    
    watermarked_count = 0
    normalized_count = 0
    success_count = 0
    
    for idx, f in enumerate(files, 1):
        filename = os.path.basename(f)
        backup_path = os.path.join(backup_dir, filename)
        
        # 1. Ensure backup exists
        if not os.path.exists(backup_path):
            shutil.copy2(f, backup_path)
            
        # 2. Read from backup to always start from clean original
        img = cv2.imread(backup_path)
        if img is None:
            print(f"  [{idx}/{total}] Warning: Could not decode {filename}, skipping.")
            continue
            
        enhanced, has_wm, was_norm = enhance_image(img)
        if enhanced is None:
            continue
            
        if has_wm:
            watermarked_count += 1
        if was_norm:
            normalized_count += 1
            
        # 3. Write enhanced image back with high quality
        ext = os.path.splitext(filename)[1].lower()
        if ext in ['.jpg', '.jpeg']:
            cv2.imwrite(f, enhanced, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
        elif ext == '.png':
            cv2.imwrite(f, enhanced, [int(cv2.IMWRITE_PNG_COMPRESSION), 4])
        else:
            cv2.imwrite(f, enhanced)
            
        success_count += 1
        if idx % 50 == 0 or idx == total:
            print(f"  Progress: {idx}/{total} ({idx/total*100:.1f}%) | Watermarks removed: {watermarked_count} | Paper normalized: {normalized_count}")
            
    print(f"\nCompleted {subject_dir}:")
    print(f"  Total processed: {success_count}/{total}")
    print(f"  Watermarks cleanly erased: {watermarked_count}")
    print(f"  Paper scans/bleed-through normalized: {normalized_count}")
    print(f"  All original files safely retained in: {backup_dir}")

def main():
    parser = argparse.ArgumentParser(description="Seomtorch Image Enhancement Pipeline")
    parser.add_argument("--subject", default="mathematics", help="Subject folder to process (default: mathematics)")
    args = parser.parse_args()
    
    base_assets = "assets/questions/myschool"
    base_backup = "assets/questions_raw_backup"
    
    if args.subject == "all":
        subjects = [d for d in os.listdir(base_assets) if os.path.isdir(os.path.join(base_assets, d))]
        for sub in subjects:
            process_subject(os.path.join(base_assets, sub), os.path.join(base_backup, sub))
    else:
        process_subject(os.path.join(base_assets, args.subject), os.path.join(base_backup, args.subject))

if __name__ == "__main__":
    main()
