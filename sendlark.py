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

subprocess.Popen(r"C:\Users\Administrator\AppData\Local\Lark\Lark.exe")


time.sleep(2)  # cho Lark load đầy đủ

x, y = 150, 600  # vị trí bên trong Lark
lark_pos = pyautogui.getWindowsWithTitle("Lark")[0]

click_x = lark_pos.left + x
click_y = lark_pos.top + y

pyautogui.click(click_x, click_y)


# Lấy cửa sổ Lark
win = pyautogui.getWindowsWithTitle("Lark")[0]

win.restore()
win.activate()
time.sleep(1)

# Tọa độ: cách phải 100px, cách dưới 100px
x = win.left + win.width - 148
y = win.top + win.height - 60

pyautogui.click(x, y)



# Lấy cửa sổ Lark
win = pyautogui.getWindowsWithTitle("Lark")[0]

win.restore()
win.activate()
time.sleep(1)

# Tọa độ: cách phải 100px, cách dưới 100px
x = win.left + win.width - 148
y = win.top + win.height - 450

pyautogui.click(x, y)

time.sleep(1)

pyautogui.write(linkFile, interval=0.02)
pyautogui.press("enter")
time.sleep(1)
pyautogui.press("enter")