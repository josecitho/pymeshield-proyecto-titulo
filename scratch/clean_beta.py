import os
import shutil

beta_dir = r"C:\Users\josev\Escritorio\PymeShield Beta"

to_delete = [
    ".dockerignore",
    ".gitignore",
    "Anexo2_Informe_TT_PymeShield_v2 (2).docx",
    "Anexo2_Informe_TT_PymeShield_v2.docx",
    "Dockerfile",
    "Guia_de_Estudio_Completa_PymeShield.docx",
    "Guia_de_Estudio_Completa_PymeShield_v2.docx",
    "ProyectoPymeShield", # Nested folder
    "PymeShield_Dashboard - copia.html",
    "docker-compose.yml",
    "files.zip",
    "guia_estudio_completa_pymeshield.md",
    "guia_presentacion_nota_maxima.md"
]

print("Starting cleanup of PymeShield Beta...")
for item in to_delete:
    target = os.path.join(beta_dir, item)
    if os.path.exists(target):
        if os.path.isdir(target):
            print(f"Deleting directory: {item}")
            shutil.rmtree(target)
        else:
            print(f"Deleting file: {item}")
            os.remove(target)
    else:
        print(f"Item not found (already clean): {item}")

print("Cleanup completed successfully!")
