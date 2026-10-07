from django.contrib.auth.hashers import make_password
new_password = "Test2025"
hashed = make_password(new_password)
print(hashed)