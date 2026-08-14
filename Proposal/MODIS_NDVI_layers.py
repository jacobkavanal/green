import requests
import xml.etree.ElementTree as ET

WMS_URL = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"

def list_gibs_layers(keyword="NDVI"):
    params = {
        "SERVICE": "WMS",
        "REQUEST": "GetCapabilities",
        "VERSION": "1.1.1"
    }

    response = requests.get(WMS_URL, params=params)
    response.raise_for_status()

    root = ET.fromstring(response.content)

    layers = []
    for layer in root.findall(".//Layer"):
        name = layer.findtext("Name")
        title = layer.findtext("Title")

        if name and title:
            text = f"{name} {title}".lower()
            if keyword.lower() in text:
                layers.append((name, title))

    return layers

ndvi_layers = list_gibs_layers("NDVI")

for name, title in ndvi_layers[:50]:
    print(name, " | ", title)