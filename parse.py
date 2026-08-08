import os, re, json

RAW_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw")

def get_titles():
    """动态扫描 raw/ 目录获取文档标题列表"""
    return sorted([f.replace('.md','') for f in os.listdir(RAW_DIR) if f.endswith('.md')])

HEADING_RE = re.compile(r'^#\s+(.*)$')

def parse_doc(title):
    path = os.path.join(RAW_DIR, title + ".md")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        text = f.read()
    lines = text.split("\n")
    segments = []          # (heading_or_None, body_lines)
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

    questions = []
    orphan_prefix = ""
    first = True
    for heading, body in segments:
        if heading is None:
            orphan = "\n".join(body).strip()
            if orphan:
                orphan_prefix = orphan + "\n\n"
            continue
        if heading == title:      # 文档标题自身，跳过
            continue
        answer = "\n".join(body).strip()
        answer = re.sub(r'\n{3,}', '\n\n', answer).strip()
        if orphan_prefix and first:
            answer = (orphan_prefix + answer).strip()
            orphan_prefix = ""
            first = False
        if not answer or answer.strip() == '[本题暂无笔记答案]':   # 空答案 / 占位符，丢弃
            continue
        questions.append({"title": heading, "answer": answer})
        first = False
    return questions

def main():
    titles = get_titles()
    documents = []
    total_q = 0
    imported = 0
    for title in titles:
        questions = parse_doc(title)
        doc_id = title
        if questions is None:
            documents.append({"id": doc_id, "title": title, "imported": False, "questions": []})
        else:
            imported += 1
            q_list = []
            for i, q in enumerate(questions, 1):
                qid = "%s#%d" % (doc_id, i)
                q_list.append({"id": qid, "title": q["title"], "answer": q["answer"], "tags": [title]})
            total_q += len(q_list)
            documents.append({"id": doc_id, "title": title, "imported": True, "questions": q_list})

    seed = {"version": 1, "source": "ima 面试题知识库", "documents": documents}

    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "seed.json"), "w", encoding="utf-8") as f:
        json.dump(seed, f, ensure_ascii=False, indent=1)

    # 回写进 index.html（内联 SEED 块），使双击打开即生效
    html_path = os.path.join(here, "index.html")
    if os.path.exists(html_path):
        with open(html_path, encoding="utf-8") as f:
            html = f.read()
        marker = "/* 题目数据"
        mi = html.find(marker)
        if mi != -1:
            s = html.rfind("<script>", 0, mi)
            e = html.find("</script>", mi)
            if s != -1 and e != -1:
                e += len("</script>")
                seed_js = json.dumps(seed, ensure_ascii=False)
                block = ('<script>\n'
                         '/* 题目数据：由 parse.py 生成，已内联以便离线双击打开（无需 seed.js） */\n'
                         'window.SEED = ' + seed_js + ';\n</script>')
                html = html[:s] + block + html[e:]
                with open(html_path, "w", encoding="utf-8") as f:
                    f.write(html)
                print("已回写 index.html 内联 SEED（%d 题）" % total_q)
            else:
                print("警告：未在 index.html 定位到 <script>/</script> 边界，跳过回写")
        else:
            print("警告：未在 index.html 找到题目数据标记，跳过回写")

    print("文档总数: %d, 已导入: %d, 题目总数: %d" % (len(documents), imported, total_q))
    for d in documents:
        flag = "✓" if d["imported"] else "待"
        print("  [%s] %-10s %d 题" % (flag, d["title"], len(d["questions"])))

if __name__ == "__main__":
    main()
