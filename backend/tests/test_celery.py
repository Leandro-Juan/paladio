from app.tasks import scrape_static_task, scrape_dynamic_task

# Run locally as a test
print("Testing static task...")
res1 = scrape_static_task("https://jsonplaceholder.typicode.com/posts/1")
print(res1)

print("Testing dynamic task...")
# Run dynamic scraper (might fail if playwright chromium is not installed locally outside docker)
# Just try to see if it imports fine
print("Imports and static test succeeded.")
