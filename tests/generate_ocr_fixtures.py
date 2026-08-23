from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = Path("/workspace/scratch/macrolens-fixtures")
OUT.mkdir(parents=True, exist_ok=True)

woff = ROOT / "node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-600-normal.woff"
devanagari_ttf = OUT / "NotoSansDevanagari-SemiBold.ttf"
font = TTFont(woff)
font.flavor = None
font.save(devanagari_ttf)

latin_font = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def paper(title: str, path: Path, typeface: str, language: str | None = None) -> None:
    image = Image.new("RGB", (1600, 620), "#f7f2e7")
    draw = ImageDraw.Draw(image)
    draw.rectangle((60, 55, 1540, 565), outline="#14223b", width=4)
    draw.line((105, 155, 1495, 155), fill="#8e2f3e", width=5)
    draw.text((105, 82), "MACROLENS DAILY", font=ImageFont.truetype(latin_font, 42), fill="#14223b")
    headline_font = ImageFont.truetype(typeface, 78)
    options = {"language": language} if language else {}
    bbox = draw.multiline_textbbox((0, 0), title, font=headline_font, spacing=20, **options)
    x = (1600 - (bbox[2] - bbox[0])) / 2
    y = 230
    draw.multiline_text((x, y), title, font=headline_font, fill="#080d18", align="center", spacing=20, **options)
    draw.text((105, 520), "MUMBAI · TEST EDITION", font=ImageFont.truetype(latin_font, 24), fill="#526078")
    image.save(path, quality=96)


def clear_devanagari(title: str, path: Path, language: str) -> None:
    image = Image.new("RGB", (1600, 620), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((70, 80, 1530, 540), outline="#111827", width=4)
    headline_font = ImageFont.truetype(str(devanagari_ttf), 104)
    bbox = draw.textbbox((0, 0), title, font=headline_font, language=language)
    x = (1600 - (bbox[2] - bbox[0])) / 2
    y = (620 - (bbox[3] - bbox[1])) / 2 - 18
    draw.text((x, y), title, font=headline_font, fill="black", language=language)
    image.save(path, quality=96)


paper("RBI KEEPS REPO RATE\nAT 5.25 PERCENT", OUT / "english-clean.png", latin_font)
clear_devanagari("आरबीआई ने रेपो दर स्थिर रखी", OUT / "hindi-clean-v2.png", "hi")
clear_devanagari("आरबीआयने रेपो दर कायम ठेवली", OUT / "marathi-clean-v2.png", "mr")

clean = Image.open(OUT / "english-clean.png").convert("RGB")
blurred = clean.resize((320, 124)).resize(clean.size)
blurred = blurred.filter(ImageFilter.GaussianBlur(8))
blurred = ImageEnhance.Contrast(blurred).enhance(0.22)
blurred.save(OUT / "english-blurry.png", quality=65)

print(f"Generated OCR fixtures in {OUT}")
