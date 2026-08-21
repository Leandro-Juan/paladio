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

class DOMChangedError(Exception):
    """
    Exception raised when a strict CSS locator fails, indicating the site's DOM has changed.
    This should be caught by the LLM fallback layer.
    """
    def __init__(self, message: str, raw_html: str = ""):
        super().__init__(message)
        self.raw_html = raw_html
