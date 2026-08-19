class BotDetectionError(Exception):
    """
    Exception raised when a CAPTCHA or bot-detection mechanism is encountered.
    """
    pass

class RateLimitError(Exception):
    """
    Exception raised when rate limits are exceeded (e.g., HTTP 429).
    """
    pass
