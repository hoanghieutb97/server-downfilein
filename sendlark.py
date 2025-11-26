import os
import sys
import time
import subprocess
import pyautogui

pyautogui.FAILSAFE = True

if len(sys.argv) < 2:
    raise SystemExit("Thiếu đường dẫn file. Gọi: python sendlark.py \"C:\\path\\file.zip\"")

linkFile = sys.argv[1]
if not os.path.exists(linkFile):
    raise SystemExit(f"Không tìm thấy file: {linkFile}")

subprocess.Popen(r"C:\Users\admin\AppData\Local\Lark\Lark.exe")
time.sleep(1)

screen_w, screen_h = pyautogui.size()
region = (0, 400, screen_w, screen_h - 400)

def find_and_click(image, region=None, confidence=0.9):
    while True:
        try:
            pos = pyautogui.locateCenterOnScreen(
                image,
                region=region,
                confidence=confidence,
                grayscale=True
            )
            if pos:
                pyautogui.click(pos)
                print(f"✅ Đã click {image}")
                break
            else:
                print(f"🔍 Đang tìm {image}...")
        except Exception:
            pass
        time.sleep(0.5)

find_and_click("ten.png")
find_and_click("them.png", region, 0.9)
find_and_click("taptin.png")

time.sleep(1)

pyautogui.write(linkFile, interval=0.02)
pyautogui.press("enter")
time.sleep(2)
pyautogui.press("enter")
