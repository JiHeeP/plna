plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.plna.widget"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.plna.widget"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            // 개인용 사이드로드라 난독화는 하지 않는다. 디버그 빌드로 그대로 써도 된다.
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

// 외부 라이브러리를 쓰지 않는다. 플랫폼 API(HttpURLConnection, org.json)만으로 충분하고,
// 의존성이 없으면 버전 충돌로 빌드가 깨질 일도 없다.
dependencies {
}
