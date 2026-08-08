openfeign
# openfeign

# 说一下openfeign的底层原理，openfeign接口会用到哪些注解？openfeign怎么设置请求头？

OpenFeign本质是声明式HTTP客户端，核心是JDK动态代理。

启动时，扫描所有带 @FeignClient 注解的接口，为每个接口生成一个动态代理对象放进 IOC 容器。调用接口方法时，代理拦截到方法名、参数、返回值类型，根据方法上的 @GetMapping、@RequestParam 等注解拼出完整的 HTTP 请求（URL、请求方式、参数、请求体）。然后通过 Ribbon 或 LoadBalancer 拿到服务名对应的真实 IP 和端口，发 HTTP 请求，拿到响应后再按返回值类型反序列化返回。

常用的注解

@FeignClient(name = "服务名", path = "/前缀") — 声明接口对应的远程服务

@GetMapping / @PostMapping / @PutMapping / @DeleteMapping — 指定 HTTP 方法和路径

@RequestParam — URL 参数

@PathVariable — 路径占位符

@RequestBody — JSON 请求体

@RequestHeader — 设置请求头

设置请求头可以单个接口，也可以全局统一

单个接口在形参加@RequestHeader

全局统一要实现RequestInterceptor接口，所有Feign请求会自动带上请求头

