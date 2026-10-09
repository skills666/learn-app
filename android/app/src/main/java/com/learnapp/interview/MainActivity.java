package com.learnapp.interview;

import android.graphics.Color;
import android.os.Bundle;

import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        /* edge-to-edge：WebView 铺满整屏（含状态栏/导航栏区域），系统栏不再是"外部黑边"，
           页面背景与内容直接画进去 —— 深浅主题下都自然衔接。
           scrim 传透明：系统栏底色由页面自己绘制（index.html 各处 env(safe-area-inset-*) 负责让位）。
           用 SystemBarStyle.dark 而不是默认的 auto：图标初始恒为浅色，与 styles.xml 里
           windowLightStatusBar=false（启动图/首帧前是深色底）一致；运行期由 Web 侧
           SafeArea.setSystemBarsStyle 按"应用主题"接管（见 index.html 的 applyTheme）。 */
        EdgeToEdge.enable(
            this,
            SystemBarStyle.dark(Color.TRANSPARENT),
            SystemBarStyle.dark(Color.TRANSPARENT)
        );
    }
}
