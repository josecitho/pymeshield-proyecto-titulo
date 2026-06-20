import os
import shutil

src = r"C:\Users\josev\Escritorio\ProyectoPymeShield01\ProyectoPymeShield"
dst = r"C:\Users\josev\Escritorio\PymeShield Beta"

# Directories/files to ignore in the copy
ignore_list = [
    "scratch",
    ".claude-dev-helper",
    ".git",
    ".github",
    ".vscode",
    "fbcA882.tmp.FileSlack.LOG1",
    "fbcA882.tmp.FileSlack.LOG2",
    "klovespizza@outlook.com.ost.FileSlack.LOG1",
    "klovespizza@outlook.com.ost.FileSlack.LOG2"
]

def ignore_patterns(path, names):
    ignored = []
    for name in names:
        if name in ignore_list:
            ignored.append(name)
    return ignored

if os.path.exists(dst):
    print(f"Removing existing destination: {dst}")
    shutil.rmtree(dst)

print(f"Copying project from {src} to {dst}...")
shutil.copytree(src, dst, ignore=ignore_patterns)
print("Copy completed successfully!")
