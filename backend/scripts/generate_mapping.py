import json
import urllib.request

import pycountry

print("Downloading airports data...")
url = "https://raw.githubusercontent.com/mwgg/Airports/master/airports.json"
req = urllib.request.Request(url)
with urllib.request.urlopen(req) as response:
    data = json.loads(response.read())

# Group by country
by_country = {}
for airport in data.values():
    iata = airport.get("iata", "").strip()
    if not iata or iata == "\\N" or iata == "0":
        continue

    city = airport.get("city", "").strip().lower()
    if not city:
        continue

    cc = airport.get("country", "")

    if cc not in by_country:
        by_country[cc] = {}

    # Prefer existing if we already mapped the city? Or overwrite?
    # Usually IATA codes have a primary one. For now we just overwrite.
    by_country[cc][city] = iata

print(f"Grouped into {len(by_country)} countries.")

with open("backend/app/utils/iata_mapping.py", "w") as f:
    f.write("def get_iata_code(city_name: str) -> str:\n")
    f.write('    """\n')
    f.write("    Returns the IATA code for a given city name.\n")
    f.write("    If not found, it interrupts the swarm to explicitly ask the user.\n")
    f.write('    """\n')
    f.write("    if not city_name:\n")
    f.write('        return "XXX"\n\n')
    f.write("    mapping = {\n")

    # Sort countries by name
    sorted_ccs = sorted(by_country.keys())
    for cc in sorted_ccs:
        country_name = cc
        try:
            c = pycountry.countries.get(alpha_2=cc)
            if c:
                country_name = c.name
        except:
            pass

        f.write(f"        # {country_name}\n")

        # Sort cities within country
        sorted_cities = sorted(by_country[cc].keys())
        for city in sorted_cities:
            iata = by_country[cc][city]
            # Escape quotes
            safe_city = city.replace('"', '\\"')
            f.write(f'        "{safe_city}": "{iata}",\n')

        f.write("\n")

    f.write("    }\n\n")
    f.write("    clean_city = city_name.lower().strip()\n")
    f.write("    if clean_city in mapping:\n")
    f.write("        return mapping[clean_city]\n\n")
    f.write("    from langgraph.types import interrupt\n")
    f.write(
        '    iata_input = interrupt(f"I don\'t know the IATA airport code for {city_name}. Please provide the 3-letter IATA code:")\n'
    )
    f.write("    return str(iata_input).upper().strip()\n")

print("Mapping generated in backend/app/utils/iata_mapping.py")
