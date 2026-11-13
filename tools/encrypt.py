"""Encrypt site/data/questions.json -> site/data/questions.enc.json (AES-256-GCM, PBKDF2-SHA256).

Usage:  python tools/encrypt.py          (prompts for username and password)
   or:  AI200_USER=name AI200_PASS=secret python tools/encrypt.py
The password is never stored; the site decrypts in the browser after login.
"""
import base64, getpass, json, os, sys
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ITER = 600_000
user = os.environ.get("AI200_USER") or input("Username: ")
pw = os.environ.get("AI200_PASS") or getpass.getpass("Password: ")
if not user or not pw:
    sys.exit("username and password required")
plain = open(os.path.join(ROOT, "site", "data", "questions.json"), "rb").read()
salt, iv = os.urandom(16), os.urandom(12)
key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(f"{user.strip().lower()}\n{pw}".encode())
ct = AESGCM(key).encrypt(iv, plain, None)
b = lambda x: base64.b64encode(x).decode()
out = {"v": 1, "kdf": "PBKDF2-SHA256", "iter": ITER, "salt": b(salt), "iv": b(iv), "ct": b(ct)}
path = os.path.join(ROOT, "site", "data", "questions.enc.json")
json.dump(out, open(path, "w"))
print("wrote", path, f"({os.path.getsize(path)//1024} KB)")
