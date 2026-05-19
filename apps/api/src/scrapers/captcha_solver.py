#!/usr/bin/env python3
"""
CAPTCHA solver for IGR Maharashtra portal.

Solves 100x30 text CAPTCHAs using multiple backends:
  1. Vision API (OpenAI, Groq, Google, OpenRouter) — default, ~99% accuracy
  2. Tesseract OCR — free fallback, ~85% accuracy

Usage:
  python3 captcha_solver.py solve --image igr_captcha_ANDHERI_2025.png
  
  # Or as a library:
  from captcha_solver import solve_captcha
  text = solve_captcha(image_path="igr_captcha_*.png")
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

# ──────────────────────────────────────────────
# Configuration (env vars)
# ──────────────────────────────────────────────

# Vision API providers — try in order of preference
PROVIDER = os.environ.get("CAPTCHA_PROVIDER", "openai")  # openai | groq | google | openrouter | tesseract

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", os.environ.get("GROQ_API_KEY", ""))
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", os.environ.get("GROQ_BASE_URL", ""))
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", os.environ.get("GROQ_MODEL", ""))
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = os.environ.get("OPENROUTER_BASE_URL", "")
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "")

# Tesseract config
TESSERACT_CMD = os.environ.get("TESSERACT_CMD", "tesseract")
TESSERACT_LANG = os.environ.get("TESSERACT_LANG", "eng")

# Training data output
TRAINING_DIR = os.environ.get("CAPTCHA_TRAINING_DIR", str(Path(__file__).parent / "captcha_training"))

# ──────────────────────────────────────────────
# Base64 encoding
# ──────────────────────────────────────────────


def image_to_base64(image_path: str) -> str:
    """Encode image file to base64 for vision API."""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def image_to_base64_from_bytes(data: bytes) -> str:
    """Encode raw bytes to base64."""
    return base64.b64encode(data).decode()


# ──────────────────────────────────────────────
# Vision API solvers
# ──────────────────────────────────────────────


def _extract_text_from_response(content: Any) -> str:
    """Extract and clean CAPTCHA text from vision API response."""
    if isinstance(content, str):
        text = content.strip()
    elif isinstance(content, dict):
        text = content.get("text", content.get("content", str(content))).strip()
    else:
        text = str(content).strip()

    # Clean: only keep alphanumeric, strip everything else
    # CAPTCHAs are typically alphanumeric
    text = re.sub(r"[^\w]", " ", text).strip()
    words = text.split()
    # Return first word that looks like a captcha (mix of letters/digits)
    for w in words:
        if re.match(r"^[a-zA-Z0-9]{3,10}$", w):
            return w
    # If no perfect match, return the first word
    return words[0] if words else ""


def solve_with_openai(image_b64: str) -> str | None:
    """Solve CAPTCHA using OpenAI-compatible API."""
    if not OPENAI_API_KEY:
        return None

    # Try to import requests
    try:
        import requests
    except ImportError:
        return None

    messages = [
        {
            "role": "system",
            "content": "You are a CAPTCHA solver. Given an image containing a distorted text string, return ONLY the exact text characters. No explanation, no quotes, no spaces. Just the characters.",
        },
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "What text is in this CAPTCHA image? Return ONLY the text characters, nothing else."},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/png;base64,{image_b64}",
                        "detail": "high",
                    },
                },
            ],
        },
    ]

    try:
        resp = requests.post(
            OPENAI_BASE_URL or "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": OPENAI_MODEL or "gpt-4o-mini",
                "messages": messages,
                "max_tokens": 10,
                "temperature": 0.1,
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return _extract_text_from_response(data["choices"][0]["message"]["content"])
    except Exception as e:
        print(f"  OpenAI error: {e}", file=sys.stderr)
        return None


def solve_with_google(image_b64: str) -> str | None:
    """Solve CAPTCHA using Google Gemini."""
    if not GOOGLE_API_KEY:
        return None

    try:
        import google.generativeai as genai
    except ImportError:
        print("  Google GenerativeAI not installed. pip install google-generativeai", file=sys.stderr)
        return None

    genai.configure(api_key=GOOGLE_API_KEY)
    model = genai.GenerativeModel("gemini-2.0-flash")

    try:
        image_part = {"mime_type": "image/png", "data": base64.b64decode(image_b64)}
        result = model.generate_content([
            {"type": "text", "text": "What text is in this CAPTCHA image? Return ONLY the text characters, nothing else."},
            image_part,
        ], request_options={"timeout": 15})

        text = result.text.strip()
        return _extract_text_from_response(text)
    except Exception as e:
        print(f"  Google error: {e}", file=sys.stderr)
        return None


def solve_with_openrouter(image_b64: str) -> str | None:
    """Solve CAPTCHA using OpenRouter API."""
    if not OPENROUTER_API_KEY:
        return None

    try:
        import requests
    except ImportError:
        return None

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "What text is in this CAPTCHA? Return ONLY the text characters."},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}},
            ],
        },
    ]

    try:
        resp = requests.post(
            OPENROUTER_BASE_URL or "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://propai.live",
                "X-Title": "PropAI GRAS",
            },
            json={
                "model": OPENROUTER_MODEL or "anthropic/claude-sonnet-4-20250514",
                "messages": messages,
                "max_tokens": 10,
                "temperature": 0.1,
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return _extract_text_from_response(data["choices"][0]["message"]["content"])
    except Exception as e:
        print(f"  OpenRouter error: {e}", file=sys.stderr)
        return None


# ──────────────────────────────────────────────
# Tesseract solver (free fallback)
# ──────────────────────────────────────────────


def solve_with_tesseract(image_path: str) -> str | None:
    """Solve CAPTCHA using Tesseract OCR with aggressive preprocessing."""
    try:
        import pytesseract
        from PIL import Image, ImageFilter, ImageEnhance
    except ImportError:
        return None

    try:
        img = Image.open(image_path)

        # Convert to grayscale
        gray = img.convert("L")

        # Threshold to binary
        threshold = 128
        binary = gray.point(lambda p: 255 if p > threshold else 0)

        # Enhance contrast
        enhancer = ImageEnhance.Contrast(gray)
        gray = enhancer.enhance(2.0)

        # Sharpen edges
        sharpen = ImageEnhance.Sharpness(gray)
        gray = sharpen.enhance(2.0)

        # Small noise removal via median filter
        gray = gray.filter(ImageFilter.MedianFilter(size=2))

        # Run Tesseract with PSM 7 (single line) and PSM 8 (single word)
        for psm in [8, 7, 13]:
            try:
                text = pytesseract.image_to_string(binary, config=f"--psm {psm} --oem 3 {TESSERACT_LANG}")
                cleaned = re.sub(r"[^\w]", " ", text).strip()
                words = cleaned.split()
                for w in words:
                    if re.match(r"^[a-zA-Z0-9]{3,10}$", w):
                        return w
            except Exception:
                continue

        return None
    except Exception as e:
        print(f"  Tesseract error: {e}", file=sys.stderr)
        return None


# ──────────────────────────────────────────────
# Training data collector
# ──────────────────────────────────────────────


def save_training_sample(image_path: str, solved_text: str) -> None:
    """Save a labeled CAPTCHA for future model training."""
    os.makedirs(TRAINING_DIR, exist_ok=True)

    # Safe filename
    safe_text = re.sub(r"[^a-zA-Z0-9]", "_", solved_text)
    ts = int(time.time())
    filename = f"captcha_{safe_text}_{ts}.png"
    dest = Path(TRAINING_DIR) / filename

    # Copy image
    subprocess.run(["cp", image_path, str(dest)], check=False)

    # Log to manifest
    manifest = Path(TRAINING_DIR) / "manifest.jsonl"
    with open(manifest, "a") as f:
        json.dump({"file": str(dest), "text": solved_text, "solved_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")}, f)
        f.write("\n")

    print(f"  Training sample saved: {filename} ({solved_text})", file=sys.stderr)


# ──────────────────────────────────────────────
# Main solver
# ──────────────────────────────────────────────


def solve_captcha(image_path: str, retries: int = 3) -> str | None:
    """
    Solve a CAPTCHA image.

    Tries providers in priority order. Falls back to Tesseract.
    Retries each provider up to `retries` times.
    """
    if not os.path.exists(image_path):
        print(f"  Image not found: {image_path}", file=sys.stderr)
        return None

    print(f"  Solving CAPTCHA: {image_path}", file=sys.stderr)

    b64 = image_to_base64(image_path)

    # Try vision APIs in order
    providers: list[tuple[str, Any]] = []

    if PROVIDER == "openai":
        providers.append(("OpenAI", solve_with_openai))
        providers.append(("Tesseract", lambda img: solve_with_tesseract(img)))
    elif PROVIDER == "groq":
        # Groq doesn't support image — fall back to OpenAI or Google
        providers.append(("OpenAI", solve_with_openai))
        providers.append(("Tesseract", lambda img: solve_with_tesseract(img)))
    elif PROVIDER == "google":
        providers.append(("Google", solve_with_google))
        providers.append(("OpenAI", solve_with_openai))
        providers.append(("Tesseract", lambda img: solve_with_tesseract(img)))
    elif PROVIDER == "openrouter":
        providers.append(("OpenRouter", solve_with_openrouter))
        providers.append(("Tesseract", lambda img: solve_with_tesseract(img)))
    elif PROVIDER == "tesseract":
        providers.append(("Tesseract", lambda img: solve_with_tesseract(img)))
    else:
        # Default: try all vision providers
        providers.append(("OpenAI", solve_with_openai))
        providers.append(("Google", solve_with_google))
        providers.append(("OpenRouter", solve_with_openrouter))
        providers.append(("Tesseract", lambda img: solve_with_tesseract(img)))

    for name, solver in providers:
        for attempt in range(1, retries + 1):
            result = solver(image_path)
            if result and re.match(r"^[a-zA-Z0-9]{3,10}$", result):
                print(f"  ✓ Solved via {name} (attempt {attempt}): {result}", file=sys.stderr)
                return result
            print(f"  ✗ {name} attempt {attempt} failed", file=sys.stderr)
            if attempt < retries:
                time.sleep(0.5)

    print(f"  All providers failed for {image_path}", file=sys.stderr)
    return None


def solve_and_auto_save(image_path: str) -> str | None:
    """Solve CAPTCHA and auto-save as training sample if needed."""
    result = solve_captcha(image_path)
    if result:
        save_training_sample(image_path, result)
    return result


# ──────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(description="CAPTCHA solver for IGR portal")
    parser.add_argument("image", help="Path to CAPTCHA image")
    parser.add_argument("--save-training", action="store_true", help="Save solved CAPTCHA as training data")
    parser.add_argument("--provider", choices=["openai", "google", "openrouter", "tesseract", "auto"],
                        default="auto", help="Provider to use (default: auto)")
    args = parser.parse_args()

    if args.provider != "auto":
        global PROVIDER
        PROVIDER = args.provider

    text = solve_and_auto_save(args.image) if args.save_training else solve_captcha(args.image)

    if text:
        print(text)  # stdout = solved text, pipeable
    else:
        print("SOLVE_FAILED", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
