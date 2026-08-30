import requests


def main():
    token = "teeosbwqq39sbexhek8etoj56v0c2ttoemx5yz1z"
    res = requests.get(
        "https://proxy.webshare.io/api/v2/proxy/list/?mode=direct",
        headers={"Authorization": f"Token {token}"},
    )
    try:
        data = res.json()["results"][0]
        url = f"http://{data['username']}:{data['password']}@{data['proxy_address']}:{data['port']}"
        with open("backend/.env", "a") as f:
            f.write(f"\\nWEBSHARE_PROXY_URL={url}\\n")
        print("Proxy URL saved to backend/.env:", url)
    except Exception as e:
        print("Error:", e)
        print(res.text)


if __name__ == "__main__":
    main()
