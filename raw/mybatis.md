mybatis
# mybatis

# mybatis的#和$的区别

#{}是预编译占位符：生成的SQL是占位符形式，参数是通过setString()设置进去的，不会改变SQL结构；

${}是字符串拼接，会有注入风险，只有表名、列名、ORDER BY这种不能预编译的场景才用，且必须对参数做白名单校验。

# 说一下mybatis的一级缓存和二级缓存

一级缓存：

是SqlSession级别的缓存，默认开启无法关闭，同一个SqlSession内，两次查询相同的SQL+参数，第二次直接从内存取，不查数据库；但是Spring整合Mybatis后，每次查询都是新的SqlSession，一级缓存基本等于没用。

在有些条件下会失效：每个SqlSession有独立的缓存，不互通；查询的SQL或参数不一样，缓存无法命中；多次查询之间执行了增删改，会清空当前SqlSession的一级缓存；手动清理缓存sqlSession.clearCache()；

二级缓存：

二级缓存是Mapper级别的缓存，跨SqlSession共享，默认关闭，需要手动开启。 SqlSession必须关闭，一级缓存才会写入二级缓存，查询的SQL和参数和之前完全一致且在同一个namespace下；多表联查时，如果查询涉及到多个namespace，二级缓存可能读到脏数据，比如A关联B表，B表改了，A的二级缓存不知道，返回旧数据。

全局配置 cacheEnabled=true（默认就是true）

Mapper.xml里加<cache/>标签

实体类实现Serializable接口

二级缓存失效的情况：namespace下发生增删改会清空该空间下的全部二级缓存；还有就是手动清理：sqlSession.clearCache() 只清一级；需要在配置中设 flushCache="true"。

# mybatis的接口方法支持重载吗？为什么？

不支持，mybatis靠接口全限定名和方法名去XML里找对应的SQL（namespace+id）。方法重载以为着同一个接口里有多个方法同名，mybatis定位到XML里同一个id，不知道该绑哪个，参数不同也没用，XML里id必须唯一。

