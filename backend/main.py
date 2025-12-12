# main.py
from itertools import islice
import os
import logging
import socket
import uuid
import json
from pathlib import Path
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from supabase import create_client, Client
import httpx
from google.cloud import vision_v1
from google.oauth2 import service_account
from PIL import Image, ImageEnhance, ImageOps

load_dotenv()

# ─────────────────────────────
# CONFIG
# ─────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("ROLE_KEY")
SUPABASE_TABLE = "products"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Be careful in production — don't log secrets. These prints are helpful while debugging.
print("SUPABASE_URL =", SUPABASE_URL)
print("SUPABASE_SERVICE_ROLE (first 10) =", (SUPABASE_KEY[:10] if SUPABASE_KEY else None))

logger = logging.getLogger("ndt-image")
logger.setLevel(logging.INFO)


app = FastAPI(title="OCR Nameplate Backend")

_allowed = os.environ.get("ALLOWED_ORIGINS") or os.environ.get("VERCEL_URL") or ""
if _allowed:
    origins = [o.strip() for o in _allowed.split(",") if o.strip()]
else:
    origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
print("Allowed origins:", origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # change if needed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"ok": True}


@app.get("/products")
def list_products():
    data = supabase.table("products").select("*").execute()
    return data.data


# ─────────────────────────────
# IMAGE PROCESSING
# ─────────────────────────────
def preprocess_image_to_tmp(upload_path: str) -> str:
    img = Image.open(upload_path)
    img = ImageOps.exif_transpose(img).convert("RGB")
    w, h = img.size
    pad = int(min(w, h) * 0.01)
    if pad > 0:
        img = img.crop((pad, pad, w - pad, h - pad))

    img = ImageEnhance.Contrast(img).enhance(1.3)
    img = ImageEnhance.Sharpness(img).enhance(1.1)

    tmp_path = "tmp_preprocessed.jpg"
    img.save(tmp_path, quality=95)
    return tmp_path


def make_high_contrast(img: Image.Image) -> Image.Image:
    g = img.convert("L")
    g = ImageEnhance.Contrast(g).enhance(3.0)
    g = ImageEnhance.Sharpness(g).enhance(2.5)
    g = ImageOps.invert(g)

    w, h = g.size
    g = g.resize((w * 2, h * 2))

    return g


# ─────────────────────────────
#  VISION OCR
# ─────────────────────────────
def get_vision_client():
    """
    Create a Google Vision client.

    Preferred: set GOOGLE_APPLICATION_CREDENTIALS_JSON env var to the JSON contents of
    the service account key (safe when stored in Render as a secret).
    Fallback: use default ADC (e.g., GOOGLE_APPLICATION_CREDENTIALS file on local dev).
    """
    creds_json = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    # Only try to load if it looks like real JSON data (starts with {) and isn't just whitespace
    if creds_json and creds_json.strip() and creds_json.strip().startswith("{"):
        try:
            info = json.loads(creds_json)
            credentials = service_account.Credentials.from_service_account_info(info)
            client = vision_v1.ImageAnnotatorClient(credentials=credentials)
            logger.info("Vision client created from GOOGLE_APPLICATION_CREDENTIALS_JSON")
            return client
        except Exception as e:
            logger.exception("Failed to create Vision client from env JSON: %s", e)
            # Don't raise here; fall back to trying file-based credentials if JSON failed/was garbage
            logger.warning("Falling back to file-based credentials due to JSON error.")

    # DEBUG: print all GOOGLE_ keys to see what is loaded
    for k, v in os.environ.items():
        if k.startswith("GOOGLE_"):
            print(f"DEBUG ENV: {k} = {v}")

    # fallback to application default credentials (useful for local dev when GOOGLE_APPLICATION_CREDENTIALS points to a file)
    try:
        # HARDCODED FALLBACK: If env var is missing, try the known file in root
        if not os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
            hardcoded_path = os.path.abspath("../image-extract-476710-c6a143e5254f.json")
            if os.path.exists(hardcoded_path):
                logger.info("Setting GOOGLE_APPLICATION_CREDENTIALS to hardcoded path: %s", hardcoded_path)
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = hardcoded_path

        client = vision_v1.ImageAnnotatorClient()
        logger.info("Vision client created using default credentials")
        return client
    except Exception as e:
        logger.exception("Failed to create Vision client using default credentials: %s", e)
        raise


def ocr_image(pil_img: Image.Image, mode="document") -> str:
    tmp = "tmp_to_vision.jpg"
    pil_img.save(tmp, quality=95)

    with open(tmp, "rb") as f:
        content = f.read()

    # use vision_v1.Image wrapper
    image = vision_v1.types.Image(content=content)
    client = get_vision_client()

    if mode == "document":
        resp = client.document_text_detection(image=image)
        if resp.error.message:
            raise Exception(resp.error.message)
        if resp.full_text_annotation:
            return resp.full_text_annotation.text or ""
        return ""

    else:
        resp = client.text_detection(image=image)
        if resp.error.message:
            raise Exception(resp.error.message)
        if resp.text_annotations:
            return resp.text_annotations[0].description
        return ""


# ─────────────────────────────
# PARSER HELPERS
# ─────────────────────────────
def is_valid_line(line: str) -> bool:
    """
    Returns False if the line looks like OCR noise/garbage.
    Heuristic: high ratio of symbols vs alphanumeric, or very long tokens.
    """
    s = line.strip()
    if not s:
        return False
    
    # If it's very long with no spaces, it's likely noise
    if len(s) > 40 and " " not in s:
        return False

    # Count alphanumeric vs "bad" symbols
    # Allowed symbols in normal text: space, ., -, /, (, ), :, "
    allowed_symbols = " .-/:()\"'"
    bad_count = sum(1 for c in s if not c.isalnum() and c not in allowed_symbols)
    
    # If more than 30% of characters are weird symbols, reject it
    if len(s) > 5 and (bad_count / len(s)) > 0.3:
        return False

    return True


def normalize_lines(txt: str) -> List[str]:
    # split lines, then filter out garbage
    lines = [ln.strip() for ln in txt.splitlines() if ln.strip()]
    return [ln for ln in lines if is_valid_line(ln)]


def looks_like_casting(line: str) -> bool:
    s = line.strip()
    if not s:
        return False

    up = s.upper()
    # "T(" is often start of Temp, but if it has no digits it might be noise.
    # We'll rely on extract_fields strictness for that.
    
    plate_starters = ("SN", "S/N", "MODEL", "DN", "PN", "PT", "BODY", "DISC", "SEAT", "DATE", "WWW.")
    if up.startswith(plate_starters):
        return False

    if " " not in up and 2 <= len(up) <= 8:
        return True

    return False


def extract_fields(lines: List[str]) -> dict:
    data = {
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
    }

    for ln in lines:
        up = ln.upper().strip()

        if data["serial_number"] is None and ("SN " in up or up.startswith("SN") or "S/N" in up):
            data["serial_number"] = ln
            continue

        if data["model"] is None and up.startswith("MODEL"):
            parts = ln.split(None, 1)
            data["model"] = parts[1] if len(parts) > 1 else ln
            continue

        if data["dn"] is None and (up.startswith("DN")):
            data["dn"] = ln
            continue

        if data["pn"] is None and (up.startswith("PN")):
            data["pn"] = ln
            continue

        if data["pt"] is None and (up.startswith("PT")):
            data["pt"] = ln
            continue

        if data["body"] is None and "BODY" in up:
            data["body"] = ln
            continue

        if data["disc"] is None and "DISC" in up:
            data["disc"] = ln
            continue

        if data["seat"] is None and "SEAT" in up:
            data["seat"] = ln
            continue

        # STRICTER TEMP CHECK: must contain digits to be a valid temperature
        if data["temp"] is None and ("T(" in up or "°C" in up or up.startswith("T°")):
            if any(c.isdigit() for c in ln):
                data["temp"] = ln
            continue

        if data["date"] is None and up.startswith("DATE"):
            data["date"] = (
                ln.replace("DATE", "", 1)
                  .replace("Date", "", 1)
                  .replace("date", "", 1)
                  .strip()
            )
            continue

    return data


def try_fill_from_casting(parsed: dict, casting_lines: List[str]) -> dict:
    up_lines = [c.upper() for c in casting_lines]

    if not parsed.get("dn"):
        for u in up_lines:
            if u.startswith("DN"):
                parsed["dn"] = u
                break

    cf8m = None
    for u, raw in zip(up_lines, casting_lines):
        if "CF8M" in u.replace("-", "").replace(" ", ""):
            cf8m = raw
            break

    if cf8m:
        parsed.setdefault("disc", cf8m)
        parsed.setdefault("body", cf8m)

    if not parsed.get("model"):
        for u, raw in zip(up_lines, casting_lines):
            if u == "TTV":
                parsed["model"] = "TTV"
                break

    return parsed


# ─────────────────────────────
# SUPABASE INSERT (REST API)
# ─────────────────────────────
async def insert_product_to_supabase(
    batch_id: str,
    product_no: int,
    parsed: dict,
    raw_text: str,
    casting_lines: Optional[List[str]] = None,
    images_json: Optional[List[Dict[str, Any]]] = None,
) -> dict:
    """
    Async-safe supabase insert with robust error handling and logging.
    Returns dict with ok: True/False and details.
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("Supabase not configured (missing SUPABASE_URL or SUPABASE_KEY)")
        return {"ok": False, "reason": "Supabase not configured"}

    casting_lines = casting_lines or []
    images_json = images_json or []
    casting_summary = ", ".join(casting_lines)

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{SUPABASE_TABLE}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    payload = {
        "batch_id": batch_id,
        "product_no": product_no,
        "serial_number": parsed.get("serial_number"),
        "model": parsed.get("model"),
        "dn": parsed.get("dn"),
        "pn": parsed.get("pn"),
        "pt": parsed.get("pt"),
        "body": parsed.get("body"),
        "disc": parsed.get("disc"),
        "seat": parsed.get("seat"),
        "temp": parsed.get("temp"),
        "raw_text": raw_text,
        "casting_lines": casting_lines,
        "images_json": images_json,
        "casting_summary": casting_summary,
    }

    # Log the call for debugging (avoid logging secret keys in production)
    logger.info("POST to Supabase URL: %s (product_no=%s, batch_id=%s)", url, product_no, batch_id)

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            text = resp.text
            status = resp.status_code
            logger.info("Supabase response status=%s", status)
            if 200 <= status < 300:
                try:
                    data = resp.json()
                except Exception:
                    data = text
                return {"ok": True, "data": data}
            else:
                logger.warning("Supabase insert failed status=%s body=%s", status, text)
                return {"ok": False, "status": status, "body": text}
    except httpx.ConnectError as e:
        # DNS or connection problem
        logger.exception("httpx.ConnectError while POSTing to Supabase: %s", e)
        return {"ok": False, "reason": "connect_error", "error": str(e)}
    except httpx.ReadTimeout as e:
        logger.exception("httpx.ReadTimeout while contacting Supabase: %s", e)
        return {"ok": False, "reason": "timeout", "error": str(e)}
    except socket.gaierror as e:
        logger.exception("socket.gaierror (DNS) while contacting Supabase: %s", e)
        return {"ok": False, "reason": "dns_error", "error": str(e)}
    except Exception as e:
        logger.exception("Unexpected error while contacting Supabase: %s", e)
        return {"ok": False, "reason": "unexpected", "error": str(e)}


# ─────────────────────────────
# OCR BULK ENDPOINT
# ─────────────────────────────

@app.post("/ocr-bulk")
async def ocr_bulk(files: List[UploadFile] = File(...)):
    """
    Treat every 3 images as 1 product:
    - 1 row in Supabase per group of up to 3 images.
    - OCR + parse each image, then aggregate within the group.
    """
    import traceback
    try:
        batch_id = str(uuid.uuid4())
        results = []
        product_no = 1

        # helper to iterate in chunks of size n
        def chunked(iterable, n):
            it = iter(iterable)
            while True:
                chunk = list(islice(it, n))
                if not chunk:
                    break
                yield chunk

        # Group incoming files 3-by-3
        for group in chunked(files, 3):
            group_texts: List[str] = []
            group_casting: List[str] = []
            group_plate_lines: List[str] = []
            group_images_json: List[Dict[str, Any]] = []
            group_results = []

            # OCR each file in this group
            for file in group:
                tmp_path = f"upload_{uuid.uuid4()}.jpg"
                try:
                    with open(tmp_path, "wb") as f:
                        f.write(await file.read())

                    preprocessed = preprocess_image_to_tmp(tmp_path)
                    pil_img = Image.open(preprocessed)

                    text1 = ocr_image(pil_img, mode="document")
                    hc = make_high_contrast(pil_img)
                    text2 = ocr_image(hc, mode="document")

                    raw_text = (text1 or "") + "\n" + (text2 or "")
                    lines = normalize_lines(raw_text)
                    casting = [ln for ln in lines if looks_like_casting(ln)]
                    plate_lines = [ln for ln in lines if not looks_like_casting(ln)]

                    group_texts.append(raw_text)
                    group_casting.extend(casting)
                    group_plate_lines.extend(plate_lines)
                    group_images_json.append({"filename": file.filename})

                    # per-image debug info (not inserted)
                    group_results.append(
                        {
                            "file": file.filename,
                            "raw_text": raw_text,
                            "casting_lines": casting,
                        }
                    )
                finally:
                    try:
                        if os.path.exists(tmp_path):
                            os.remove(tmp_path)
                    except Exception:
                        pass

            # Now parse once per group (all plate lines merged)
            parsed = extract_fields(group_plate_lines)
            parsed = try_fill_from_casting(parsed, group_casting)

            # Join all texts and unique casting lines
            combined_raw_text = "\n\n".join(group_texts)
            unique_casting = list(dict.fromkeys(group_casting))  # preserve order

            # Insert ONE row into Supabase for this group
            supabase_res = await insert_product_to_supabase(
                batch_id=batch_id,
                product_no=product_no,
                parsed=parsed,
                raw_text=combined_raw_text,
                casting_lines=unique_casting,
                images_json=group_images_json,
            )

            results.append(
                {
                    "product_no": product_no,
                    "files": [r["file"] for r in group_results],
                    "parsed": parsed,
                    "casting_lines": unique_casting,
                    "supabase": supabase_res,
                    "images": group_images_json,
                }
            )

            product_no += 1

        return {
            "batch_id": batch_id,
            "count": len(results),  # number of products (groups)
            "results": results,
        }
    except Exception as e:
        logger.error("CRITICAL ERROR in /ocr-bulk: %s", e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────
# HEALTH CHECK
# ─────────────────────────────
@app.get("/health")
def root_health():
    return {"status": "OK", "message": "OCR backend live"}
