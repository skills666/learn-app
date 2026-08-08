git
# git

# 你们公司是怎么管理分支的？遇到代码冲突怎么解决？

我们团队用的是Git Flow简化版，主干分支master只放生产代码，日常开发在develop拉feature分支，每个需求一个feature分支；开发完合并回develop，自测通过后代码走代码审查，同事在GitLab上提合并请求，至少一个人审查通过才能合。

develop稳定后会拉一个release分支，部署预发布环境验证，验证通过就把release合并到master，打tag发版，同时把release代码再合到develop，保证两边一致。紧急bug就从master拉hotfix分支，修复完合并到master和develop。

遇到代码冲突，先在本地拉最新的develop，把develop合到自己分支上，对着解决就行，对方的改动对我的需求没关系就留着，有关系就跟同事沟通怎么合并。

