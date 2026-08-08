import os, re

RAW_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw")

def get_titles():
    """动态扫描 raw/ 目录获取文档标题列表"""
    return sorted([f.replace('.md','') for f in os.listdir(RAW_DIR) if f.endswith('.md')])

HEADING_RE = re.compile(r'^#\s+(.*)$')

def scan(title):
    path = os.path.join(RAW_DIR, title + ".md")
    if not os.path.exists(path):
        return {"missing": True}
    with open(path, encoding="utf-8") as f:
        text = f.read()
    lines = text.split("\n")
    segments = []
    cur_heading = None
    cur_body = []
    for line in lines:
        m = HEADING_RE.match(line)
        if m:
            if cur_heading is not None:
                segments.append((cur_heading, cur_body))
            elif cur_body:
                segments.append((None, cur_body))
            cur_heading = m.group(1).strip()
            cur_body = []
        else:
            cur_body.append(line)
    if cur_heading is not None:
        segments.append((cur_heading, cur_body))
    elif cur_body:
        segments.append((None, cur_body))

    issues = []
    n_q = 0
    n_dropped = 0
    for idx, (heading, body) in enumerate(segments):
        if heading is None:
            orphan = "\n".join(body).strip()
            if orphan:
                preview = orphan[:60].replace("\n", " ")
                issues.append(("FLOATING_ANSWER", "无标题的游离答案(在首个#之前): %r" % preview))
            continue
        if heading == title:
            issues.append(("STRAY_TITLE", "出现与文档同名的标题行 # %s" % heading))
            continue
        if heading == "":
            issues.append(("EMPTY_HEADING", "存在空标题行 # (无文字)"))
            continue
        answer = "\n".join(body).strip()
        embedded = []
        for bl in body:
            if HEADING_RE.match(bl):
                embedded.append(bl.strip())
        if not answer or answer.strip() == '[本题暂无笔记答案]':
            n_dropped += 1
            issues.append(("EMPTY_ANSWER", "题目 %r 答案为空/占位符(将被丢弃)" % heading))
            continue
        if embedded:
            issues.append(("EMBEDDED_HEADING", "题目 %r 的答案里混入了其它标题: %s" % (heading, embedded)))
        n_q += 1
    return {"missing": False, "n_q": n_q, "n_dropped": n_dropped, "issues": issues}

def main():
    titles = get_titles()
    total_q = 0
    total_dropped = 0
    any_issue = False
    for title in titles:
        r = scan(title)
        if r.get("missing"):
            print("[缺失] %s.md 未找到" % title)
            any_issue = True
            continue
        total_q += r["n_q"]
        total_dropped += r["n_dropped"]
        if r["issues"]:
            any_issue = True
            print("\n=== %s === (%d 题, %d 丢弃)" % (title, r["n_q"], r["n_dropped"]))
            for kind, msg in r["issues"]:
                print("  [%-16s] %s" % (kind, msg))
        else:
            print("[OK ] %s (%d 题, %d 丢弃)" % (title, r["n_q"], r["n_dropped"]))
    print("\n==== 汇总 ====")
    print("题目总数(有效): %d, 丢弃(空答案): %d" % (total_q, total_dropped))
    print("存在问题的文档: %s" % ("是" if any_issue else "否"))

if __name__ == "__main__":
    main()
