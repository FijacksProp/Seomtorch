#!/usr/bin/env python3
"""
Image Enhancement Pipeline for Word Document Export ONLY.
Reads originals from assets/questions/myschool/<subject>/,
writes enhanced copies to assets/questions_enhanced/<subject>/.
The original site images are NEVER modified.

Usage:
    python scripts/enhance_for_docx.py --subject biology
    python scripts/enhance_for_docx.py --subject all
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

    # 1. Precise watermark detection (coral/pink hue from MySchool.com.ng)
    wm_mask = (diff_rg > 14) & (diff_rb > 14) & (r > 130)
    has_watermark = bool(np.sum(wm_mask) > 75)

    if has_watermark:
        base = r.copy()
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        dilated = cv2.dilate(wm_mask.astype(np.uint8), kernel)
        base[(dilated > 0) & (r > 105)] = 255
    else:
        base = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 2. Paper/scan normalization
    med = np.median(base)
    was_normalized = False
    if med < 220:
        was_normalized = True
        k_size = min(35, max(15, (min(h_orig, w_orig) // 8) | 1))
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (k_size, k_size))
        bg = cv2.morphologyEx(base, cv2.MORPH_CLOSE, kernel)
        norm = cv2.divide(base, bg, scale=255)
        p2 = np.percentile(norm, 1.5)
        if p2 > 50:
            norm = np.clip((norm.astype(float) - p2) / (240.0 - p2) * 255.0, 0, 255).astype(np.uint8)
        base = norm

    # 3. 2x Lanczos4 upscale
    upscaled = cv2.resize(base, (w_orig * 2, h_orig * 2), interpolation=cv2.INTER_LANCZOS4)

    # 4. Unsharp masking
    gaussian = cv2.GaussianBlur(upscaled, (0, 0), 1.0)
    sharpened = cv2.addWeighted(upscaled, 1.25, gaussian, -0.25, 0)

    # 5. Tone curve: pure white bg, deep dark ink
    lut = np.zeros(256, dtype=np.uint8)
    for i in range(256):
        if i >= 220:
            lut[i] = 255
        elif i <= 60:
            lut[i] = 0
        else:
            lut[i] = int((i - 60) / (220 - 60) * 255)

    res = cv2.LUT(sharpened, lut)
    return cv2.cvtColor(res, cv2.COLOR_GRAY2BGR), has_watermark, was_normalized


def process_subject(subject, base_src, base_out):
    src_dir = os.path.join(base_src, subject)
    out_dir = os.path.join(base_out, subject)

    if not os.path.exists(src_dir):
        print(f"  SKIP: {src_dir} not found")
        return

    os.makedirs(out_dir, exist_ok=True)
    files = sorted(glob.glob(os.path.join(src_dir, "*.*")))
    total = len(files)
    if total == 0:
        print(f"  SKIP: No images in {src_dir}")
        return

    print(f"\n{'='*60}")
    print(f"  Subject: {subject.upper()} — {total} images")
    print(f"  Source:   {src_dir}")
    print(f"  Output:   {out_dir}")
    print(f"{'='*60}")

    wm_count = 0
    norm_count = 0
    ok_count = 0

    for idx, f in enumerate(files, 1):
        filename = os.path.basename(f)
        out_path = os.path.join(out_dir, filename)

        # Skip if already enhanced
        if os.path.exists(out_path):
            ok_count += 1
            if idx % 100 == 0 or idx == total:
                print(f"  [{idx}/{total}] (cached)")
            continue

        img = cv2.imread(f)
        if img is None:
            print(f"  [{idx}/{total}] WARNING: Could not decode {filename}, skipping.")
            continue

        enhanced, has_wm, was_norm = enhance_image(img)
        if enhanced is None:
            continue

        if has_wm:
            wm_count += 1
        if was_norm:
            norm_count += 1

        ext = os.path.splitext(filename)[1].lower()
        if ext in ['.jpg', '.jpeg']:
            cv2.imwrite(out_path, enhanced, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
        elif ext == '.png':
            cv2.imwrite(out_path, enhanced, [int(cv2.IMWRITE_PNG_COMPRESSION), 4])
        else:
            cv2.imwrite(out_path, enhanced)

        ok_count += 1
        if idx % 50 == 0 or idx == total:
            print(f"  [{idx}/{total}] ({idx/total*100:.1f}%) | WM removed: {wm_count} | Normalized: {norm_count}")

    print(f"\n  DONE: {subject.upper()} complete: {ok_count}/{total} enhanced")
    print(f"     Watermarks erased: {wm_count} | Paper normalized: {norm_count}")
    return ok_count


def main():
    parser = argparse.ArgumentParser(description="Enhance images for Word doc export only (originals untouched)")
    parser.add_argument("--subject", default="all",
                        help="Subject folder to process, or 'all' (default: all)")
    args = parser.parse_args()

    base_src = os.path.join("assets", "questions", "myschool")
    base_out = os.path.join("assets", "questions_enhanced")

    selected = [
        "biology", "mathematics", "english-language",
        "chemistry", "physics", "further-mathematics"
    ]

    if args.subject == "all":
        subjects = selected
    else:
        subjects = [args.subject]

    print(f"Seomtorch Image Enhancement Pipeline (docx-only)")
    print(f"Subjects to process: {', '.join(subjects)}")

    grand_total = 0
    for sub in subjects:
        count = process_subject(sub, base_src, base_out)
        if count:
            grand_total += count

    print(f"\n{'='*60}")
    print(f"  ALL DONE — {grand_total} images enhanced across {len(subjects)} subjects")
    print(f"  Enhanced images saved to: {base_out}/")
    print(f"  Original site images: UNTOUCHED")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
