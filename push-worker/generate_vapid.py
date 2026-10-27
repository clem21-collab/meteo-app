import base64
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


private_key = ec.generate_private_key(ec.SECP256R1())
private_value = private_key.private_numbers().private_value.to_bytes(32, "big")
public_value = private_key.public_key().public_bytes(
    serialization.Encoding.X962,
    serialization.PublicFormat.UncompressedPoint,
)

print("VAPID_PUBLIC_KEY=" + b64url(public_value))
print("VAPID_PRIVATE_KEY=" + b64url(private_value))
print("VAPID_SUBJECT=https://clem21-collab.github.io/meteo-app/")
