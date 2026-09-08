import os
import sys
import requests


def main():
    token = os.environ.get("WEBSHARE_API_KEY")
    if not token:
        print(
            "Error: WEBSHARE_API_KEY environment variable is not set.", file=sys.stderr
        )
        sys.exit(1)

    res = requests.get(
        "https://proxy.webshare.io/api/v2/proxy/list/?mode=direct",
        headers={"Authorization": f"Token {token}"},
    )
    try:
        data = res.json()["results"][0]
        url = f"http://{data['username']}:{data['password']}@{data['proxy_address']}:{data['port']}"

        env_path = "backend/.env"
        lines = []
        if os.path.exists(env_path):
            with open(env_path, "r") as f:
                lines = f.readlines()

        found = False
        new_lines = []
        for line in lines:
            if line.startswith("WEBSHARE_PROXY_URL="):
                new_lines.append(f"WEBSHARE_PROXY_URL={url}\n")
                found = True
            else:
                new_lines.append(line)

        if not found:
            if new_lines and not new_lines[-1].endswith("\n"):
                new_lines[-1] += "\n"
            new_lines.append(f"WEBSHARE_PROXY_URL={url}\n")

        with open(env_path, "w") as f:
            f.writelines(new_lines)

        print("Proxy URL saved to backend/.env:", url)
    except Exception as e:
        print("Error:", e)
        print(res.text)


if __name__ == "__main__":
    main()
