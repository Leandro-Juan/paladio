from pydantic import BaseModel
from datetime import date
class T(BaseModel):
    d: date

try:
    T(d='2026-08-23 to 2026-08-27')
except Exception as e:
    print(repr(e))
