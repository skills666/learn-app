web
# web

# 你说一下前后端实现上传文件的步骤

首先前端用FormData封装文件，通过multipart/form-data POST到后端。SpringBoot用@RequestParam MultipartFile接收，调transferTo上传OSS，配置里限制文件大小防攻击。

额外考虑：文件名用UUID重命名防覆盖和路径遍历攻击，文件类型白名单校验防止恶意上传，大文件分片上传+秒传优化体验。

# 你说一下过滤器和拦截器的区别

过滤器是Servlet规范，是Tomcat管理，执行在拦截器之前，可以拦截所有请求包括静态资源，实现的是Filter接口。

拦截器是Spring MVC的，由Spring IOC管理，只拦截进DispatcherServlet的请求，能拿到Handler和方法参数，颗粒度更细，还能直接注入Spring Bean，实现的是HandlerInterceptor接口。

# 你们是怎么保存用户登录信息的？你们的jwt需要在服务端存储吗？说一下jwt的组成部分有哪些？如何防篡改？

服务器不存，把用户信息处理成Token给前端，每次请求带上来服务端验证确认身份。

不需要，JWT是无状态的，服务端不存，靠签名验证身份。

JWT分三段，用.分隔：Header包含签名算法+token类型；Payload里有用户信息、过期时间等声明；Signature里是Header+Payload用secret签出来的。

防篡改靠签名，攻击者改Payload算不出签名，验签会失败。JWT优点是天然支持分布式，缺点是没法主动踢人。只能靠短过期+长过期配合使用，前者泄露损失小，后者免去频繁登录。

补充：access token 设 15 分钟短过期，被偷了损失窗口小；refresh token 设 7 天长过期，用来续 access token，不用频繁登录。

# get请求和post请求的区别

GET参数在URL，主要用于获取数据，受URL长度限制（约2KB~8KB，不同浏览器不同），参数暴露在URL上，可缓存、可收藏、幂等，不适合传敏感信息。

post参数在请求体里，主要用于提交数据，大小理论上无限制，默认不缓存、不可收藏、不幂等、后退会重新提交。

# 说一下cookie和session的区别

Cookie 存在客户端，Session 存在服务端。Cookie 容量 4KB，明文存储，客户端可查看和篡改，所以要设 HttpOnly 防 JS 读取、Secure 强制走 HTTPS传输、SameSite 防跨站请求伪造攻击。不设过期时间浏览器关闭就删，设了 Max-Age 可以持久保留。Cookie 只能存字符串。

Session 不限制大小，可以存任意对象，服务端设超时时间，Tomcat 默认 30 分钟无操作失效，有操作就重置。Session 默认通过 Cookie 传递 sessionId，禁了 Cookie 可以用 URL 重写代替。

分布式环境下 Session 必须集中存 Redis，否则请求落到不同机器找不到 Session。

# 怎么优化慢接口？

慢接口优化首先是定位，用APM类工具看调用链，找到耗时长的环节。

数据库慢就看执行计划，建索引、排查索引失效、减少回表，循环查数据库可以考虑合并成批量查询；

远程调用慢就异步化或加熔断，查多改少的热点数据加Redis缓存，要注意缓存一致性，及时更新和删除；实在慢的业务就异步化，接口先返回，后台慢慢处理。

我知道的大概就这些。

# 什么是跨域问题？怎么解决跨域问题？

跨域是协议、端口、域名，只要有一个不同，就是跨域。浏览器会拦截跨域请求的响应，导致前端拿不到数据。后端其实收到了请求也正常返回数据，只是浏览器不给前端用。

最常用的就是在Gateway网关统一配CORS，所有请求先过网关，网关校验Origin、加跨域响应头，下游服务不用管。

