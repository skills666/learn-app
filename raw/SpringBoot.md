SpringBoot
# SpringBoot

# 什么是IOC？什么是DI？有哪些方式？推荐用哪种？

IOC是控制反转，把对象创建和依赖管理交给Spring容器，不需要自己手动new对象。

DI就是依赖注入，是IOC的具体实现方式，容器创建Bean时，自动把它需要的依赖注入进去。

DI的三种方式：

构造器注入，依赖不可变、强制依赖

Setter注入，依赖可变，可能漏设

字段注入，代码最简洁

推荐构造器注入，依赖可以设final保证不变，脱离容器手动new时依赖必须传，不传就编译报错，单元测试也方便直接传mock。

# @Autowired和@Resource的区别

@Autowired默认按类型注入，如果多个同类型要配合@Qualifier。可以修饰构造器、字段、Setter、方法参数，有required属性可以允许为空。

@Resource是JDK的，默认按名称注入，找不到再按类型。可修饰字段、Setter、不支持构造器，没有required属性。

# springboot默认是单例还是多例？有哪些作用域？怎么修改为多例？默认是懒加载还是饥饿加载？怎么变成懒加载？bean是线程安全的吗？

Spring Boot默认是单例，Spring容器中默认一个Bean对应一个实例，整个容器共享这个对象。

作用域：

Singleton（单例）

Prototype（多例，每次获取都创建新实例）

Request（每个HTTP请求创建一个实例）

Session（每个HTTP Session创建一个实例）

Application（整个ServletContext创建一个实例）

修改为多例：在需要修改为多例的类上加上@Scope注解，参数给prototype就行。

加载方式：默认是饥饿加载，单例Bean是在容器启动时就创建好，不会等到第一次调用才创建。目的是启动时就把问题暴露出来，如果创建失败，启动就报错，而不是运行到一半才炸。

修改为懒加载：方式一，在需要懒加载的Bean上加个@Lazy注解；方式二，在application全局配置，所有Bean不会在启动时创建，等到第一次被注入或调用时才创建。

线程安全性：

线程安不安全主要看有没有可变的成员变量，如果Bean是无状态的，只操作入参和局部变量，那不管是单例还是多例都是安全的。

实际开发中，Controller、Service、Dao基本都是无状态的，所以默认单例不会有问题；如果确实需要保存状态，可以通过prototype作用域或ThreadLocal来解决。

# 说一下bean的生命周期

Bean 的生命周期，我按四个大阶段理解： 实例化 → 属性赋值 → 初始化 → 销毁。 学习生命周期主要是为理解 Spring 提供的扩展点机制，比如  Aware 、 BeanPostProcessor 、初始化和销毁回调，Spring 会在对应阶段自动回调。 当然内部细节比较多，如果要完全搞清楚需要结合源码。我目前只了解这些。

第一段实例化：Spring通过反射调用构造方法创建Bean对象。

第二阶段属性填充：给Bean注入依赖的属性值，如果Bean实现了Aware接口，依次调用BeanNameAware → BeanFactoryAware → ApplicationContextAware。

第三阶段前置处理：遍历所有BeanPostProcessor的postProcessBeforeInitialization方法；初始化：按顺序执行@PostConstruct方法 → InitializingBean的afterPropertiesSet() → init-method指定的方法；后置处理：遍历所有BeanPostProcessor的postProcessAfterInitialization方法。

第四阶段：Bean就绪，可以被使用了。

第五阶段销毁：容器关闭时，执行@PreDestroy → DisposableBean的destory() → destory-method指定的方法。

### 补充：BeanPostProcessor 是什么？

它是一个接口，有两个方法 postProcessBeforeInitialization 和 postProcessAfterInitialization，Spring 容器中所有的 BeanPostProcessor 会依次对每个 Bean 调用这两个方法，AOP 的代理对象就是通过这个机制创建的。

# 什么是spring的循环依赖？怎么解决？

两个或多个Bean之间互相依赖，形成闭环。比如A依赖B，B也依赖A，Spring创建A时需要注入B，创建B时又要注入A，就卡住了。

Spring 解决循环依赖的核心是提前暴露半成品引用。

以 A 依赖 B、B 依赖 A 为例：A 先实例化，然后将半成品对象放入缓存；在填充属性时发现需要 B，就去创建 B；B 填充属性会先拿到 A 的半成品对象先注入；等 B 初始化完成，A 再注入完整的 B，最后自己也初始化完成。

底层通过三级缓存实现，第三级缓存存放 ObjectFactory，用于生成半成品对象（可能涉及 AOP 代理）。

需要注意，这种方案只适用于非构造器注入，构造器注入由于实例还没创建，没办法提前暴露半成品对象，会直接抛出异常。

# 怎么搭建一个springboot项目？还有你们用的springboot的版本是什么？

搭建 Spring Boot 项目我一般按标准流程来：

先建一个 Maven 项目，在 pom 里指定 spring-boot-starter-parent作为父工程，然后引入 spring-boot-starter-web这个起步依赖，版本由父工程统一管理。

接着在 resources 目录下创建 application.yml作为配置文件，最后写一个启动类，加上 @SpringBootApplication注解，在 main 方法里调用 SpringApplication.run()就可以了。

目前用的默认是Spring Boot 3.5.14，老项目在逐步迁移。

# springboot的优缺点是什么？说一下springboot自动装配原理（其实和自定义starter原理一样）

优点：

SpringBoot最大的好处就是约定大于配置，以前写Spring的一堆XML配置文件，现在不用写了。

还内置了Tomcat不用打war包。

还有starter机制一键引入依赖，对象自动注入IOC容器

缺点：

就是封装太深了，出问题不好排查。

还有就是版本强耦合，升级SpringBoot可能其他依赖就不兼容。

另外对小项目来说有点重，不如原生Spring轻量。

自动装配：

Spring Boot自动装配的核心入口是@SpringBootApplication 注解，它里面组合了@EnableAutoConfiguration。

@EnableAutoConfiguration通过@Import 导入了AutoConfigurationImportSelector这个类。它会从所有引入的 jar 包里扫描META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports 文件(老版本是 spring.factories)，把里面声明的所有自动配置类名加载出来。

但不是全部都会生效。这些自动配置类上大量使用了@Conditional 系列条件注解，比如@ConditionalOnClass检查classpath有没有对应的类，@ConditionalOnMissingBean检查容器里是不是已经有了这个Bean。只有条件满足的配置才会被注册到IOC容器。

另外自动配置的加载优先级比用户自定义的低。如果我们在项目里自己写了同名的Bean，会覆盖自动配置默认提供的那个。

自定义啊Starter 原理和这个一样，在Starter里写一个配置类，在META-INF/spring目录下建 org.springframework.boot.autoconfigure.AutoConfiguration.imports文件，里面写上配置类的全限定类名，Spring Boot启动时就会自动加载。

# 怎么在项目中引用配置文件的配置？

一般有两种方式

@Value：一个一个注入

@ConfigurationProperties：写实体类上，前缀匹配批量注入，自动映射到嵌套类，还能加@Validated做校验

补充：运行时动态获取用Environment.getProperty；

外部独立配置文件，用@PropertySource+@ConfigurationProperties

# springboot常用注解有哪些？spring常用注解有哪些？

SpringBoot

@SpringBootApplication：是一个复合注解，包含@Configuration + @EnableAutoConfiguration + @ComponentScan

@RestController：是@Controller  + @ResponseBody的组合，返回JSON

@ConfigurationProperties：将配置文件中的属性批量绑定到一个类上。比如spring.datasource开头的配置

Spring

IOC相关

@Component：通用组件注解，把类交给Spring管理

@Service：标记业务层组件

@Controller：标记控制层组件

@Autowired：按类型自动注入

@Qualifier：和 @Autowired 搭配，多个同类型 Bean 时按名字选

AOP相关

@Aspect：声明该类是切面类

@Transactional：声明式事务

@Pointcut：定义切入点表达式

@Around：环绕通知，最常用，能控制方法执行前后

# 给定一个jar包，如何修改里面的配置？具体怎么在不重启的情况下修改配置？（其实问的就是配置中心的热更新）

jar包里的配置是写死的，要改不重启只能把配置放到外面。我们项目用的Nacos配置中心，把配置从jar包里抽到Nacos上，启动时从Nacos拉取。要热更新就在Bean上打@RefreshScope注解，配置变更后Nacos会推送通知，Spring会销毁然后重新创建打了@RefreshScope注解的Bean，新配置生效不用重启。

# 说一下springboot和springcloud的区别

SpringBoot是单体应用的快速开发框架，简化配置开箱即用。SpringCloud是在Boot之上做的一套微服务解决方案，解决服务注册发现、配置中心、网关、熔断这些分布式问题。简单说Boot让你快速写服务，Cloud让多个服务能协同工作。

# @RestController和@Controller的区别

@Controller是SpringMVC控制器，返回视图名，配合视图解析器渲染页面。

@RestController就是@Controller和@ResponseBody的组合注解，类下所有方法返回值会序列化为JSON写入响应体，不走视图解析器。如果是基本数据类型会返回本值。

# 说一下springmvc的执行流程

口述：请求进来会先到DispatcherServlet，它会根据URL找到对应的处理方法和拦截器，然后通过适配器调Controller的具体逻辑。返回的结果如果是前后端分离就直接输出json，如果是老项目再走视图解析渲染页面。

所有请求先被DispatcherServlet拦截，DispatcherServlet调用HandlerMapping根据URL找对应的Handler，返回一个HandlerExecutionChain(也就是处理器+拦截器链)，再调用HandlerAdapter执行这个Handler，适配器负责调用Controller里的具体方法，返回一个ModelAndView，如果有视图，DispatcherServlet调用ViewResolver把逻辑视图名解析成真正的页面路径，然后把Model里的数据填充到视图页面，生成最终的HTML响应给用户。

# 你们项目是怎么处理异常的？你说一下怎么实现全局自定义异常处理器？

我们项目里采用全局统一异常处理，Service层遇到业务问题，直接抛出自定义异常，不做try-catch；Controller层也不处理异常，保持代码简洁。

所有异常最终都会被全局异常处理器拦截，统一封装成result结构返回给前端，保证前端收到的异常格式一致。

实现主要用两个注解，定义一个类，上面加@RestControllerAdvice，表示这是一个全局异常处理器；在方法上使用@ExceptionHandler指定要处理的异常类型，比如自定义业务异常。方法内部把异常转成统一的result返回。

通常会再写一个兜底方法，处理未被捕获的异常，避免异常直接抛给前端。

# 什么是aop？说一下实现aop的步骤？有哪些通知？项目中哪里用到了aop？

AOP全称面向切面编程，简单说就是把一些跟核心业务无关但又到处重复的代码（比如打日志、权限校验、事务管理），从业务代码里抽出来，放到一个独立的切面统一管理，运行时再动态地把这些代码切入到目标位置执行。

实现步骤：先导入依赖，定义一个切面类，加@Aspect和@Component注解，用@Pointcut指定切入点表达式，然后绑定通知类型，编写具体切入逻辑。

通知类型：前置通知、后置通知、返回通知、异常通知、环绕通知（最强大，但必须手动调用proceed()）。简单场景用具体通知类型更清晰。

项目应用：操作日志记录（谁在什么时候调了什么方法，传了什么参数）、权限校验、接口耗时统计、配合Redis和自定义注解防止重复提交。

# aop失效有哪些场景？

比较常见的场景就是同一个类内部方法调用会失效，因为AOP基于动态代理，this走的是目标对象本身，不是代理对象，所以切面不生效。

AOP默认只代理public修饰的方法。

final方法，CGLIB通过生成子类来代理，final方法无法被子类重写，所以无法增强。

静态方法也会失效，因为静态方法属于类，不属于实例，动态代理无法拦截。

还有就是切面表达式写错，匹配不到任何方法。

排查思路：检查方法是否public，是否内部调用，切入点表达式是否正确，是否被final/static修饰，切面类是否被Spring扫描到。

# 造成属于同一个bean的方法自调用问题的原因是什么？怎么解决？

AOP底层是动态代理，代理对象调用目标方法才会触发切面逻辑。自调用this指向的是目标对象，不是代理对象，所以直接绕过了代理，AOP失效。

解决方案：

最常用的是-注入自己：Spring对自注入有特殊处理，注入进来的是代理对象，不是原始对象。

拆成两个类：从根源上消除自调用，缺点是多了个类。

用AopContext.currentProxy()获取当前代理：需要现在启动类上或配置类上加@EnableAspectJAutoProxy(exposeProxy = true) 开关。

