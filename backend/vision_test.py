# vision_test.py
import os
import sys
from pathlib import Path
from typing import List, Dict, Any

# 0) force credentials here
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = r"D:\streamlit\env\NDT-image\image-extract-476710-c6a143e5254f.json"

from google.cloud import vision
from PIL import Image, ImageEnhance, ImageOps


# ---------- image helpers ----------
def preprocess_image(img_path: str) -> str:
    """light cleanup for plates"""
    img = Image.open(img_path)
    img = ImageOps.exif_transpose(img).convert("RGB")
    w, h = img.size
    pad = int(min(w, h) * 0.01)
    if pad > 0:
        img = img.crop((pad, pad, w - pad, h - pad))
    img = ImageEnhance.Contrast(img).enhance(1.3)
    img = ImageEnhance.Sharpness(img).enhance(1.1)
    tmp_path = str(Path("tmp_ocr.jpg").resolve())
    img.save(tmp_path, quality=95)
    return tmp_path


def make_high_contrast(img: Image.Image) -> Image.Image:
    img = img.convert("L")
    img = ImageEnhance.Contrast(img).enhance(3.0)
    img = ImageEnhance.Sharpness(img).enhance(2.5)
    img = ImageOps.invert(img)
    w, h = img.size
    img = img.resize((w * 2, h * 2))
    return img


def crop_center_band(img: Image.Image, band_ratio: float = 0.4) -> Image.Image:
    """keep centre vertical band – where small embossing often is"""
    w, h = img.size
    band_w = int(w * band_ratio)
    x1 = (w - band_w) // 2
    x2 = x1 + band_w
    return img.crop((x1, 0, x2, h))


# ---------- OCR ----------
def vision_client():
    return vision.ImageAnnotatorClient()


def ocr_try(client, pil_img: Image.Image, mode: str = "document") -> str:
    tmp = "tmp_fallback.jpg"
    pil_img.save(tmp, quality=95)
    with open(tmp, "rb") as f:
        content = f.read()
    image = vision.Image(content=content)

    if mode == "document":
        resp = client.document_text_detection(image=image)
    else:
        resp = client.text_detection(image=image)

    if resp.error.message:
        # don't kill whole script – just return empty
        return ""

    if mode == "document":
        if resp.full_text_annotation and resp.full_text_annotation.text:
            return resp.full_text_annotation.text
        return ""
    else:
        if resp.text_annotations:
            return resp.text_annotations[0].description
        return ""


# ---------- parser ----------
def normalize_lines(txt: str) -> List[str]:
    return [ln.strip() for ln in txt.splitlines() if ln.strip()]


def extract_fields(lines: List[str]) -> Dict[str, Any]:
    data: Dict[str, Any] = {
        "serial_number": None,
        "model": None,
        "dn": None,
        "pn": None,
        "pt": None,
        "body": None,
        "disc": None,
        "seat": None,
        "temp": None,
        "date": None,
        "raw_lines": lines,
    }

    for ln in lines:
        up = ln.upper()

        if ("SN" in up or "S/N" in up) and data["serial_number"] is None:
            data["serial_number"] = ln
            continue

        if up.startswith("MODEL") and data["model"] is None:
            parts = ln.split(None, 1)
            data["model"] = parts[1] if len(parts) > 1 else ln
            continue

        if up.startswith("DN ") and data["dn"] is None:
            data["dn"] = ln
            continue

        if up.startswith("PN ") and data["pn"] is None:
            data["pn"] = ln
            continue

        if up.startswith("PT ") and data["pt"] is None:
            data["pt"] = ln
            continue

        if "BODY" in up and data["body"] is None:
            data["body"] = ln
            continue

        if "DISC" in up and data["disc"] is None:
            data["disc"] = ln
            continue

        if "SEAT" in up and data["seat"] is None:
            data["seat"] = ln
            continue

        if "T(" in up or "T°C" in up or "T (°C" in up:
            if data["temp"] is None:
                data["temp"] = ln
            continue

        if up.startswith("DATE") and data["date"] is None:
            data["date"] = ln.replace("DATE", "").replace("Date", "").strip()
            continue

    return data


# ---------- main flow ----------
def main():
    if len(sys.argv) < 2:
        print("Usage: python vision_test.py <image_path>")
        sys.exit(1)

    img_path = sys.argv[1]
    if not os.path.exists(img_path):
        print(f"Image not found: {img_path}")
        sys.exit(1)

    prepped_path = preprocess_image(img_path)
    base_img = Image.open(prepped_path)
    client = vision_client()

    # 1) normal document
    text = ocr_try(client, base_img, mode="document")

    # 2) plain text
    if not text.strip():
        text = ocr_try(client, base_img, mode="text")

    # 3) high-contrast
    if not text.strip():
        hc = make_high_contrast(base_img)
        text = ocr_try(client, hc, mode="text")

    # 4) rotations of high-contrast
    if not text.strip():
        hc = make_high_contrast(base_img)
        for angle in (90, 180, 270):
            rot = hc.rotate(angle, expand=True)
            text = ocr_try(client, rot, mode="text")
            if text.strip():
                break

    # 5) centre-band zoom, then OCR
    if not text.strip():
        hc = make_high_contrast(base_img)
        band = crop_center_band(hc, 0.45)
        text = ocr_try(client, band, mode="text")

    print("=== RAW OCR TEXT ===")
    print(text)
    print("====================")

    if not text.strip():
        print("No text detected even after all fallbacks.")
        return

    # build final lines
    lines = normalize_lines(text)
    if len(lines) == 2:
        l1 = lines[0].strip()
        l2 = lines[1].strip()
        if (l1 in ("N", "IN")) and l2.isdigit():
            lines = [f"{l2} N"]

    # fix short numeric lines like 852
    fixed_lines: List[str] = []
    for ln in lines:
        s = ln.strip()
        if s.isdigit() and 2 <= len(s) <= 4:
            ln = s + " ?"
        fixed_lines.append(ln)
    lines = fixed_lines

    joined = " ".join(lines).upper()
    looks_like_plate = any(
        kw in joined
        for kw in ["MODEL", "DN ", "PN ", "PT ", "BODY", "DISC", "SEAT", "DATE", "SN "]
    )

    if looks_like_plate:
        fields = extract_fields(lines)
        print("\n=== PARSED FIELDS ===")
        for k, v in fields.items():
            print(f"{k}: {v}")
    else:
        print("\n=== SIMPLE TEXT (no plate structure) ===")
        for ln in lines:
            print(ln)


if __name__ == "__main__":
    main()
