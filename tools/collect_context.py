import os

# Укажите путь к папке с вашим проектом
ROOT_DIR = "."  # Текущая папка со скриптом
OUTPUT_FILE = "context.txt"

# Расширения файлов, которые стоит собирать (можно добавить или убрать)
VALID_EXTENSIONS = {
    ".py",
    ".js",
    ".ts",
    ".html",
    ".css",
    ".json",
    ".md",
    ".txt",
    ".yml",
    ".yaml",
}

# Папки, которые нужно пропустить
EXCLUDE_DIRS = {
    ".git",
    "__pycache__",
    "venv",
    "env",
    "node_modules",
    "build",
    "dist",
}


def bundle_files():
  with open(OUTPUT_FILE, "w", encoding="utf-8") as outfile:
    for root, dirs, files in os.walk(ROOT_DIR):
      # Исключаем ненужные папки "на лету"
      dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]

      for file in files:
        file_path = os.path.join(root, file)
        _, ext = os.path.splitext(file)

        # Пропускаем сам выходной файл, если он лежит в этой же папке
        if os.path.abspath(file_path) == os.path.abspath(OUTPUT_FILE):
          continue

        # Проверяем расширение (или уберите это условие, если нужны вообще все файлы)
        if ext.lower() in VALID_EXTENSIONS:
          outfile.write(f"\n\n{'='*50}\n")
          outfile.write(f"FILE: {file_path}\n")
          outfile.write(f"{'='*50}\n\n")

          try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as infile:
              outfile.write(infile.read())
          except Exception as e:
            outfile.write(f"[Ошибка при чтении файла: {e}]\n")

  print(f"Готово! Все файлы сохранены в: {OUTPUT_FILE}")


if __name__ == "__main__":
  bundle_files()
