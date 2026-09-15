"""Generate a Werkzeug password hash for ADMIN_PASSWORD_HASH.
Usage:
    python tools_hash_password.py [optional_password]
"""
import sys
from getpass import getpass
from werkzeug.security import generate_password_hash

if len(sys.argv) > 1:
    password = sys.argv[1]
else:
    password = getpass("Enter admin password: ")

hashed = generate_password_hash(password)
print("\nGenerated Werkzeug Hash:")
print(hashed)
print("\nAdd to backend/.env as:")
print(f"ADMIN_PASSWORD_HASH={hashed}")
