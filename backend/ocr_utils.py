# backend/ocr_utils.py
import os
from pathlib import Path
from typing import Dict, Any, List

from google.cloud import vision
from PIL import Image, ImageEnhance, ImageOps

# read credentials from env (loaded in main.py)
GCP_CRED = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
if not GCP_CRED:
    # last fallback – hardcode (you can remove this if you don't like it)
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = r"D:\streamlit\env\NDT-image\image-extract-476710-c6a143e5254f.json"

client = vision.ImageAnnotatorClient()


def preprocess_for_vision(path: str) -> str:
    """light rotate + contrast → temp jpg"""
    img = Image.open(path)
    img = ImageOps.exif_transpose(img).convert("RGB")
    img = ImageEnhance.Contrast(img).enhance(1.3)
    tmp = str(Path(path).with_name("tmp_" + Path(path).name))
    img.save(tmp, quality=95)
    return tmp


def ocr_image_to_text(path: str) -> str:
    """returns full text or '' """
    prepped = preprocess_for_vision(path)
    with open(prepped, "rb") as f:
        content = f.read()
    image = vision.Image(content=content)

    # 1) document mode
    resp = client.document_text_detection(image=image)
    if resp.error.message:
        raise Exception(resp.error.message)
    if resp.full_text_annotation and resp.full_text_annotation.text:
        return resp.full_text_annotation.text

    # 2) fallback simple text
    resp2 = client.text_detection(image=image)
    if resp2.text_annotations:
        return resp2.text_annotations[0].description

    return ""


# we will use this later (step 4/5) to parse nameplates
def parse_nameplate_text(txt: str) -> Dict[str, Any]:
    lines = [ln.strip() for ln in txt.splitlines() if ln.strip()]
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
        if ("SN " in up or "S/N" in up) and not data["serial_number"]:
            data["serial_number"] = ln
        elif up.startswith("MODEL") and not data["model"]:
            parts = ln.split(None, 1)
            data["model"] = parts[1] if len(parts) > 1 else ln
        elif up.startswith("DN ") and not data["dn"]:
            data["dn"] = ln
        elif up.startswith("PN ") and not data["pn"]:
            data["pn"] = ln
        elif up.startswith("PT ") and not data["pt"]:
            data["pt"] = ln
        elif "BODY" in up and not data["body"]:
            data["body"] = ln
        elif "DISC" in up and not data["disc"]:
            data["disc"] = ln
        elif "SEAT" in up and not data["seat"]:
            data["seat"] = ln
        elif "T(" in up or "T°C" in up or "T (°C" in up:
            data["temp"] = ln
        elif up.startswith("DATE") and not data["date"]:
            data["date"] = ln.replace("DATE", "").replace("Date", "").strip()

    return data
