import os, re

RAW_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw")

def get_titles():
    return sorted([f.replace('.md','') for f in os.listdir(RAW_DIR) if f.endswith('.md')])

def main():
    total_removed = 0
    for title in get_titles():
        path = os.path.join(RAW_DIR, title + ".md")
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            lines = f.readlines()
        pat = re.compile(r'^#\s+' + re.escape(title) + r'\s*$')
        out = []
        removed = 0
        for line in lines:
            if pat.match(line.rstrip("\n")):
                removed += 1
                total_removed += 1
                continue
            out.append(line)
        if removed:
            with open(path, "w", encoding="utf-8") as f:
                f.writelines(out)
            print("移除 %-10s 中 %d 行同名标题" % (title, removed))
    print("共移除 %d 行" % total_removed)

if __name__ == "__main__":
    main()
