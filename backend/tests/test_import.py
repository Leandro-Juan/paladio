import sys
import traceback

try:
    import app.main
    print("SUCCESS")
except Exception as e:
    traceback.print_exc()
